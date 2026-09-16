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

interface TransactionParseContext {
  period: StatementPeriod;
  previousBalance?: number;
}

interface ParsedTransaction extends BankTransaction {
  amountWasInferred?: boolean;
}

interface MoneyToken {
  value: string;
  index: number;
  end: number;
}

interface BalanceToken extends MoneyToken {
  suffix: "Cr" | "Dr";
}

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
    const parsed = parseFnbStatementText(text);
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

export function parseFnbStatementText(text: string): { statement: BankStatement; warnings: ParseWarning[] } {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const warnings: ParseWarning[] = [];
  const period = parsePeriod(findPeriod(lines));
  const openingBalance = parseOptionalSignedMoney(findBalanceValue(lines, "Opening Balance"));
  const closingBalance = parseOptionalSignedMoney(findBalanceValue(lines, "Closing Balance"));
  let previousBalance = openingBalance;
  const transactionLines = findTransactionLines(lines);
  const transactions: BankTransaction[] = [];

  for (const line of transactionLines) {
    if (isNonTransactionLine(line)) {
      continue;
    }

    const transaction = parseTransaction(line, { period, previousBalance });
    if (!transaction) {
      warnings.push({ code: "FNB_TRANSACTION_SKIPPED", message: `Skipped unrecognized transaction line: ${line}` });
      continue;
    }

    const { amountWasInferred: _amountWasInferred, ...bankTransaction } = transaction;
    transactions.push(bankTransaction);
    previousBalance = transaction.balance;
  }

  if (transactions.length === 0) {
    throw new Error("No FNB transactions were parsed.");
  }

  return {
    statement: {
      institution: "FNB",
      accountNumberMasked: findAccountNumber(lines),
      period,
      openingBalance,
      closingBalance,
      transactions,
    },
    warnings,
  };
}

function parseTransaction(line: string, context: TransactionParseContext): ParsedTransaction | undefined {
  if (isNonTransactionLine(line)) {
    return undefined;
  }

  return parsePipeTransaction(line)
    ?? parseHomeLoanTransaction(line, context)
    ?? parseCompactCurrentAccountTransaction(line, context)
    ?? parseWhitespaceTransaction(line, context);
}

function parsePipeTransaction(line: string): ParsedTransaction | undefined {
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
    balance: parseSignedMoney(balance),
    reference: reference || undefined,
  };
}

function parseWhitespaceTransaction(line: string, context: TransactionParseContext): ParsedTransaction | undefined {
  const compactMatch = line.match(/^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([(-]?(?:R|ZAR)?\s?[\d,\s]+\.\d{2}\)?)\s+([(-]?(?:R|ZAR)?\s?[\d,\s]+\.\d{2}\)?\s*(?:Cr|Dr)?)\s*([A-Z0-9-]+)?$/i);
  if (!compactMatch?.[1] || !compactMatch[2] || !compactMatch[3] || !compactMatch[4]) {
    return undefined;
  }

  const parsedBalance = parseSignedMoney(compactMatch[4]);
  return withInferredAmount({
    date: parseDate(compactMatch[1]),
    description: compactMatch[2].trim(),
    amount: parseMoney(compactMatch[3]),
    currency: "ZAR",
    balance: parsedBalance,
    reference: compactMatch[5]?.trim(),
  }, context);
}

function parseCompactCurrentAccountTransaction(line: string, context: TransactionParseContext): ParsedTransaction | undefined {
  const match = line.match(/^(\d{2}\s+[A-Za-z]{3})(?!\s+\d{4})(.+)$/);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  const moneyTokens = findMoneyTokens(match[2]);
  const balanceToken = findBalanceToken(match[2], moneyTokens);
  if (!balanceToken) {
    return undefined;
  }

  const balance = parseSignedMoney(`${balanceToken.value} ${balanceToken.suffix}`);
  const beforeBalance = match[2].slice(0, balanceToken.index);
  const split = splitAmountFromPrefix(beforeBalance, context.previousBalance, balance)
    ?? splitAmountFromLastToken(beforeBalance);
  if (!split) {
    return undefined;
  }

  const description = split.description || "Bank Charges";
  return withInferredAmount({
    date: parseDateInPeriod(match[1], context.period),
    description,
    amount: split.amount,
    currency: "ZAR",
    balance,
  }, context);
}

function parseHomeLoanTransaction(line: string, context: TransactionParseContext): ParsedTransaction | undefined {
  const match = line.match(/^(\d{2}\s+[A-Za-z]{3}\s+\d{4})(.+)$/);
  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  const moneyTokens = findMoneyTokens(match[2]);
  const balanceToken = findBalanceToken(match[2], moneyTokens);
  if (!balanceToken) {
    return undefined;
  }

  const beforeBalance = match[2].slice(0, balanceToken.index).trim();
  const balance = parseSignedMoney(`${balanceToken.value} ${balanceToken.suffix}`);

  if (/^Opening Balance\b/i.test(beforeBalance) || /^Closing Balance\b/i.test(beforeBalance)) {
    return undefined;
  }

  const amountToken = moneyTokens.filter((token) => token.index < balanceToken.index).at(-1);
  const description = amountToken ? match[2].slice(0, amountToken.index).trim() : beforeBalance.trim();
  if (!description) {
    return undefined;
  }

  const amount = context.previousBalance === undefined
    ? parseTransactionAmount(amountToken?.value ?? "0.00")
    : roundMoney(balance - context.previousBalance);

  return {
    date: parseDate(match[1]),
    description,
    amount,
    currency: "ZAR",
    balance,
    amountWasInferred: true,
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

function findPeriod(lines: string[]): string {
  const statementPeriod = optionalMatch(lines, /^Statement Period\s*:?\s*(.+)$/i)
    ?? optionalMatch(lines, /^Period\s*:?\s*(.+)$/i);
  if (statementPeriod) {
    return statementPeriod;
  }

  const homeLoanPeriod = optionalMatch(lines, /^Home Loan Transaction History from\s+(.+)$/i);
  if (homeLoanPeriod) {
    return homeLoanPeriod;
  }

  throw new Error("Missing FNB statement period.");
}

function optionalMatch(lines: string[], pattern: RegExp): string | undefined {
  return lines.map((line) => line.match(pattern)).find(Boolean)?.[1]?.trim();
}

function findAccountNumber(lines: string[]): string | undefined {
  for (const line of lines) {
    const shortMatch = line.match(/^Account\s*:\s*(.+)$/i);
    if (shortMatch?.[1]) {
      return shortMatch[1].trim();
    }

    const directMatch = line.match(/^Account Number\s*:?\s*(.+)$/i);
    if (directMatch?.[1]) {
      return directMatch[1].trim();
    }

    const colonMatch = line.match(/^.+\s+Account Number\s*:?\s*(.+)$/i);
    if (colonMatch?.[1]) {
      return colonMatch[1].trim();
    }

    const productMatch = line.match(/^.+ Account\s*:\s*(.+)$/i);
    if (productMatch?.[1]) {
      return productMatch[1].trim();
    }
  }

  return undefined;
}

function findBalanceValue(lines: string[], label: "Opening Balance" | "Closing Balance"): string | undefined {
  const labelPattern = new RegExp(`^${label}\\s*:?\\s*(.*)$`, "i");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line?.match(labelPattern);
    if (!match) {
      continue;
    }

    const value = match[1]?.trim();
    if (value) {
      return value;
    }

    const nextLine = lines[index + 1]?.trim();
    if (nextLine && looksLikeMoney(nextLine)) {
      return nextLine;
    }
  }

  const transactionLine = lines.find((line) => line.includes(label));
  return transactionLine?.match(/(\d[\d, ]*\.\d{2}\s*(?:Cr|Dr)?)$/i)?.[1]?.trim();
}

function findLabeledValue(lines: string[], pattern: RegExp): string | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line?.match(pattern);
    if (!match) {
      continue;
    }

    const value = match[1]?.trim();
    if (value) {
      return value;
    }

    return lines[index + 1]?.trim();
  }

  return undefined;
}

function findTransactionLines(lines: string[]): string[] {
  const transactionLines: string[] = [];
  let inTransactionSection = false;

  for (const line of lines) {
    if (/^Transactions in RAND \(ZAR\)/i.test(line) || /^Transactions:?$/i.test(line) || /^Home Loan Transaction History from\b/i.test(line)) {
      inTransactionSection = true;
      continue;
    }

    if (!inTransactionSection) {
      continue;
    }

    if (/Closing Balance/i.test(line) || /^(?:Turnover for Statement Period|Total Vatable Transactions|Vat Portion|Current Vat Rate)\b/i.test(line)) {
      break;
    }

    transactionLines.push(line);
  }

  return transactionLines;
}

function isNonTransactionLine(line: string): boolean {
  return /^(?:date|posting date|description|amount|balance|accrued|bank|charges|transaction|debits|credits|r|page\b|delivery method|ns\/|en\/)/i.test(line)
    || /^Transactions in RAND \(ZAR\)/i.test(line)
    || /^\d{2}\s+[A-Za-z]{3}(?:\s+\d{4})?Opening Balance\b/i.test(line)
    || /^\d{2}\s+[A-Za-z]{3}(?:\s+\d{4})?Closing Balance\b/i.test(line)
    || /^\d{3,}$/.test(line);
}

function withInferredAmount(transaction: ParsedTransaction, context: TransactionParseContext): ParsedTransaction {
  if (context.previousBalance === undefined || transaction.balance === undefined) {
    return transaction;
  }

  const inferredAmount = roundMoney(transaction.balance - context.previousBalance);
  if (amountsEqual(Math.abs(inferredAmount), Math.abs(transaction.amount))) {
    return { ...transaction, amount: inferredAmount, amountWasInferred: true };
  }

  return transaction;
}

function findMoneyTokens(value: string): MoneyToken[] {
  return [...value.matchAll(/\d[\d, ]*\.\d{2}/g)].map((match) => ({
    value: match[0],
    index: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function findBalanceToken(value: string, tokens: MoneyToken[]): BalanceToken | undefined {
  for (const token of [...tokens].reverse()) {
    const suffix = findMoneySuffix(value, token);
    if (suffix) {
      return { ...token, suffix };
    }
  }

  return undefined;
}

function findMoneySuffix(value: string, token: MoneyToken): "Cr" | "Dr" | undefined {
  const suffix = value.slice(token.end).match(/^\s*(Cr|Dr)/i)?.[1];
  if (!suffix) {
    return undefined;
  }

  return suffix.toLowerCase() === "dr" ? "Dr" : "Cr";
}

function splitAmountFromPrefix(prefix: string, previousBalance: number | undefined, balance: number): { description: string; amount: number } | undefined {
  if (previousBalance === undefined) {
    return undefined;
  }

  const amount = roundMoney(balance - previousBalance);
  const absoluteAmount = Math.abs(amount);
  for (const variant of amountTextVariants(absoluteAmount)) {
    const escapedVariant = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = prefix.match(new RegExp(`^(.*)${escapedVariant}\\s*(?:Cr|Dr)?$`, "i"));
    if (match?.[1] !== undefined) {
      return { description: match[1].trim(), amount };
    }
  }

  return undefined;
}

function splitAmountFromLastToken(prefix: string): { description: string; amount: number } | undefined {
  const moneyTokens = findMoneyTokens(prefix);
  const amountToken = moneyTokens.at(-1);
  if (!amountToken) {
    return undefined;
  }

  const suffix = findMoneySuffix(prefix, amountToken);
  return {
    description: prefix.slice(0, amountToken.index).trim(),
    amount: parseTransactionAmount(`${amountToken.value}${suffix ? ` ${suffix}` : ""}`),
  };
}

function amountTextVariants(amount: number): string[] {
  const fixed = amount.toFixed(2);
  const [whole = "0", cents = "00"] = fixed.split(".");
  const comma = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const space = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return [...new Set([`${comma}.${cents}`, `${space}.${cents}`, fixed])];
}

function parsePeriod(value: string): StatementPeriod {
  const match = value.match(/^(.+?)\s+(?:to|-)\s+(.+)$/i);
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

  const monthMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (monthMatch?.[1] && monthMatch[2] && monthMatch[3]) {
    return `${monthMatch[3]}-${monthNumber(monthMatch[2])}-${monthMatch[1].padStart(2, "0")}`;
  }

  throw new Error(`Invalid date: ${value}`);
}

function parseDateInPeriod(value: string, period: StatementPeriod): string {
  const trimmed = value.trim();
  const monthMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (!monthMatch?.[1] || !monthMatch[2]) {
    return parseDate(trimmed);
  }

  const fromYear = Number(period.from.slice(0, 4));
  const toYear = Number(period.to.slice(0, 4));
  const month = monthNumber(monthMatch[2]);
  const candidateYears = fromYear === toYear ? [fromYear] : [fromYear, toYear];

  for (const year of candidateYears) {
    const candidate = `${year}-${month}-${monthMatch[1].padStart(2, "0")}`;
    if (candidate >= period.from && candidate <= period.to) {
      return candidate;
    }
  }

  return `${toYear}-${month}-${monthMatch[1].padStart(2, "0")}`;
}

function parseOptionalSignedMoney(value: string | undefined): number | undefined {
  return value === undefined ? undefined : parseSignedMoney(value);
}

function parseSignedMoney(value: string): number {
  const signMatch = value.trim().match(/(.+?)\s*(Cr|Dr)$/i);
  const amount = parseMoney(signMatch?.[1] ?? value);
  if (!signMatch?.[2]) {
    return amount;
  }

  return signMatch[2].toLowerCase() === "dr" ? -Math.abs(amount) : Math.abs(amount);
}

function parseTransactionAmount(value: string): number {
  const signMatch = value.trim().match(/(.+?)\s*(Cr|Dr)$/i);
  const amount = parseMoney(signMatch?.[1] ?? value);
  if (signMatch?.[2]?.toLowerCase() === "cr") {
    return Math.abs(amount);
  }

  if (signMatch?.[2]?.toLowerCase() === "dr") {
    return -Math.abs(amount);
  }

  return -Math.abs(amount);
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

function looksLikeMoney(value: string): boolean {
  return /^(?:R|ZAR)?\s*\d[\d, ]*\.\d{2}\s*(?:Cr|Dr)?$/i.test(value.trim());
}

function monthNumber(value: string): string {
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(value.toLowerCase().slice(0, 3));
  if (month < 0) {
    throw new Error(`Invalid month: ${value}`);
  }
  return String(month + 1).padStart(2, "0");
}
