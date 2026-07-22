import {
  amountsEqual,
  createMetadata,
  errorResult,
  okResult,
  roundMoney,
  sourceFileName,
  unknownError,
  type ParseCheck,
  type ParseInput,
  type ParseResult,
  type ParseWarning,
} from "@awesome-za/core";
import { extractPdfText } from "@awesome-za/pdf-utils";
import type { BankStatement, BankTransaction, StatementPeriod } from "@awesome-za/schemas";

const PARSER_NAME = "@awesome-za/fnb";
const PARSER_VERSION = "0.1.0";

export async function parse(input: ParseInput): Promise<ParseResult<BankStatement>> {
  return parseFnbStatement(input);
}

export async function parseFnbStatement(input: ParseInput): Promise<ParseResult<BankStatement>> {
  const baseMetadata = createMetadata({
    parser: PARSER_NAME,
    parserVersion: PARSER_VERSION,
    sourceFileName: sourceFileName(input.filePath),
  });

  try {
    const { text } = await extractPdfText(input.filePath);
    const parsed = parseText(text);
    const checks = buildChecks(parsed.statement);
    const warnings = [...parsed.warnings, ...checksToWarnings(checks)];
    const confidence = checks.some((check) => check.status === "failed") ? "medium" : "high";

    return okResult({
      data: parsed.statement,
      warnings,
      metadata: { ...baseMetadata, confidence, checks },
    });
  } catch (error) {
    return errorResult({
      metadata: baseMetadata,
      errors: [unknownError(error)],
    });
  }
}

function parseText(text: string): { statement: BankStatement; warnings: ParseWarning[] } {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const warnings: ParseWarning[] = [];
  const period = parsePeriod(requiredMatch(lines, /^Period:\s*(.+)$/i, "Missing FNB statement period."));
  const transactionsStart = lines.findIndex((line) => /^Transactions:?$/i.test(line));
  const transactionLines = transactionsStart >= 0 ? lines.slice(transactionsStart + 1) : [];
  const transactions = transactionLines.flatMap((line) => {
    const transaction = parseTransaction(line);
    if (!transaction) {
      warnings.push({ code: "FNB_TRANSACTION_SKIPPED", message: `Skipped unrecognized transaction line: ${line}` });
      return [];
    }
    return [transaction];
  });

  if (transactions.length === 0) {
    throw new Error("No FNB transactions were parsed.");
  }

  return {
    statement: {
      institution: "FNB",
      accountNumberMasked: optionalMatch(lines, /^Account:\s*(.+)$/i),
      period,
      openingBalance: parseOptionalMoney(optionalMatch(lines, /^Opening Balance:\s*(.+)$/i)),
      closingBalance: parseOptionalMoney(optionalMatch(lines, /^Closing Balance:\s*(.+)$/i)),
      transactions,
    },
    warnings,
  };
}

function parseTransaction(line: string): BankTransaction | undefined {
  const parts = line.split("|").map((part) => part.trim());
  if (parts.length < 4) {
    return undefined;
  }

  const [date, description, amount, balance, reference] = parts;
  if (!date || !description || !amount || !balance) {
    return undefined;
  }

  return {
    date: parseDate(date),
    description,
    amount: parseMoney(amount),
    currency: "ZAR",
    balance: parseMoney(balance),
    reference: reference || undefined,
  };
}

function buildChecks(statement: BankStatement): ParseCheck[] {
  const checks: ParseCheck[] = [];

  if (statement.openingBalance === undefined || statement.closingBalance === undefined) {
    checks.push({
      name: "statement-balance-reconciliation",
      status: "skipped",
      message: "Opening or closing balance is missing.",
    });
  } else {
    const transactionTotal = statement.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    const expectedClosing = roundMoney(statement.openingBalance + transactionTotal);
    checks.push({
      name: "statement-balance-reconciliation",
      status: amountsEqual(expectedClosing, statement.closingBalance) ? "passed" : "failed",
      message: `Expected closing balance ${expectedClosing}; parsed ${statement.closingBalance}.`,
    });
  }

  const runningBalanceFailed = statement.transactions.some((transaction, index, transactions) => {
    if (transaction.balance === undefined) {
      return false;
    }

    const previousBalance = index === 0 ? statement.openingBalance : transactions[index - 1]?.balance;
    if (previousBalance === undefined) {
      return false;
    }

    return !amountsEqual(previousBalance + transaction.amount, transaction.balance);
  });

  checks.push({
    name: "running-balance-reconciliation",
    status: runningBalanceFailed ? "failed" : "passed",
    message: runningBalanceFailed ? "At least one parsed transaction does not reconcile to its running balance." : undefined,
  });

  return checks;
}

function checksToWarnings(checks: ParseCheck[]): ParseWarning[] {
  return checks
    .filter((check) => check.status === "failed")
    .map((check) => ({ code: "FNB_RECONCILIATION_FAILED", message: check.message ?? `${check.name} failed.` }));
}

function requiredMatch(lines: string[], pattern: RegExp, message: string): string {
  const match = lines.map((line) => line.match(pattern)).find(Boolean);
  const value = match?.[1]?.trim();
  if (!value) {
    throw new Error(message);
  }
  return value;
}

function optionalMatch(lines: string[], pattern: RegExp): string | undefined {
  return lines.map((line) => line.match(pattern)).find(Boolean)?.[1]?.trim();
}

function parsePeriod(value: string): StatementPeriod {
  const match = value.match(/^(.+?)\s+to\s+(.+)$/i);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid period: ${value}`);
  }
  return { from: parseDate(match[1]), to: parseDate(match[2]) };
}

function parseDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match?.[1] && match[2] && match[3]) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  throw new Error(`Invalid date: ${value}`);
}

function parseOptionalMoney(value: string | undefined): number | undefined {
  return value === undefined ? undefined : parseMoney(value);
}

function parseMoney(value: string): number {
  const normalized = value.replace(/R|ZAR|\s|,/gi, "");
  const negativeMatch = normalized.match(/^\((.+)\)$/);
  const amount = Number(negativeMatch?.[1] ?? normalized);

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid money amount: ${value}`);
  }

  return negativeMatch ? -roundMoney(amount) : roundMoney(amount);
}
