import {
  amountsEqual,
  roundMoney,
  ToolboxError,
  unknownError,
  type ParseCheck,
  type ParseError,
  type ParseWarning,
} from "@awesome-za/core";
import type { BankStatement, BankTransaction, StatementPeriod } from "@awesome-za/schemas";
import type { FnbStatementFamily } from "./detection.js";

export const FNB_STRATEGY_ORDER = [
  "personal-current-pipe-v1",
  "personal-current-standard-columns-v1",
  "personal-current-compact-tax-invoice-v1",
  "business-compact-tax-invoice-v1",
  "home-loan-transaction-history-v1",
] as const;

export type FnbStrategyName = typeof FNB_STRATEGY_ORDER[number];

export interface FnbStrategyProvenance {
  family: FnbStatementFamily;
  version: string;
  extraction: "pdf-text" | "provided-text";
  lineCount: number;
  pages?: number;
  applicabilityEvidence: string[];
}

export interface FnbStrategyResult {
  strategy: FnbStrategyName;
  family: FnbStatementFamily;
  version: string;
  applicable: boolean;
  ok: boolean;
  statement?: BankStatement;
  warnings: ParseWarning[];
  errors: ParseError[];
  checks: ParseCheck[];
  provenance: FnbStrategyProvenance;
}

interface NumberedLine {
  text: string;
  lineNumber: number;
}

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

interface FnbStatementStrategy {
  name: FnbStrategyName;
  family: FnbStatementFamily;
  version: string;
  applicability(lines: string[]): string[];
  parseTransaction(line: string, context: TransactionParseContext): ParsedTransaction | undefined;
}

const STRATEGIES: FnbStatementStrategy[] = [
  {
    name: "personal-current-pipe-v1",
    family: "personal-current-account",
    version: "pipe-v1",
    applicability: (lines) => evidenceWhen([
      ["transactions-section", lines.some((line) => /^Transactions\s*:?$/i.test(line))],
      ["pipe-transaction-row", lines.some((line) => /^\d{4}-\d{2}-\d{2}\s*\|/.test(line))],
    ]),
    parseTransaction: parsePipeTransaction,
  },
  {
    name: "personal-current-standard-columns-v1",
    family: "personal-current-account",
    version: "standard-columns-v1",
    applicability: (lines) => evidenceWhen([
      ["transactions-section", lines.some((line) => /^Transactions\s*:?$/i.test(line))],
      ["standard-column-transaction-row", lines.some((line) => /^(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\s+.+\s+[-(]?(?:R|ZAR)?\s?[\d, ]+\.\d{2}/i.test(line) && !line.includes("|"))],
    ]),
    parseTransaction: parseWhitespaceTransaction,
  },
  {
    name: "personal-current-compact-tax-invoice-v1",
    family: "personal-current-account",
    version: "compact-tax-invoice-v1",
    applicability: compactAccountApplicability,
    parseTransaction: parseCompactAccountTransaction,
  },
  {
    name: "business-compact-tax-invoice-v1",
    family: "business-account",
    version: "compact-tax-invoice-v1",
    applicability: compactAccountApplicability,
    parseTransaction: parseCompactAccountTransaction,
  },
  {
    name: "home-loan-transaction-history-v1",
    family: "home-loan",
    version: "transaction-history-v1",
    applicability: (lines) => evidenceWhen([
      ["home-loan-transaction-history", lines.some((line) => /^Home Loan Transaction History from\b/i.test(line))],
      ["home-loan-dated-row", lines.some((line) => /^\d{2}\s+[A-Za-z]{3}\s+\d{4}.+\d[\d ]*\.\d{2}(?:Cr|Dr)/i.test(line))],
    ]),
    parseTransaction: parseHomeLoanTransaction,
  },
];

export function runFnbStrategiesForText(input: {
  text: string;
  family: FnbStatementFamily;
  extraction: "pdf-text" | "provided-text";
  pages?: number;
}): FnbStrategyResult[] {
  const lines = normalizeLines(input.text);

  return STRATEGIES
    .filter((strategy) => strategy.family === input.family)
    .map((strategy) => runStrategy(strategy, lines, input.extraction, input.pages))
    .sort((left, right) => FNB_STRATEGY_ORDER.indexOf(left.strategy) - FNB_STRATEGY_ORDER.indexOf(right.strategy));
}

export function buildFnbStatementChecks(statement: BankStatement): ParseCheck[] {
  const requiredFieldsPresent = statement.openingBalance !== undefined
    && statement.closingBalance !== undefined
    && statement.transactions.length > 0;
  const checks: ParseCheck[] = [{
    name: "required-statement-fields",
    status: requiredFieldsPresent ? "passed" : "failed",
    message: requiredFieldsPresent ? undefined : "Opening balance, closing balance, and at least one transaction are required.",
  }];

  const balancesComplete = statement.transactions.every((transaction) => transaction.balance !== undefined);
  checks.push({
    name: "transaction-balance-coverage",
    status: balancesComplete ? "passed" : "failed",
    message: balancesComplete ? undefined : "Every transaction must include a running balance for this supported layout.",
  });

  if (statement.openingBalance === undefined || statement.closingBalance === undefined) {
    checks.push({
      name: "statement-balance-reconciliation",
      status: "failed",
      message: "Opening or closing balance is missing.",
    });
  } else {
    const transactionTotal = statement.transactions.reduce((sum, transaction) => sum + transaction.amount, 0);
    const expectedClosing = roundMoney(statement.openingBalance + transactionTotal);
    checks.push({
      name: "statement-balance-reconciliation",
      status: amountsEqual(expectedClosing, statement.closingBalance) ? "passed" : "failed",
      message: amountsEqual(expectedClosing, statement.closingBalance) ? undefined : "Statement balances do not reconcile with parsed transactions.",
    });
  }

  const runningBalanceFailed = statement.transactions.some((transaction, index, transactions) => {
    if (transaction.balance === undefined) {
      return true;
    }

    const previousBalance = index === 0 ? statement.openingBalance : transactions[index - 1]?.balance;
    return previousBalance === undefined || !amountsEqual(previousBalance + transaction.amount, transaction.balance);
  });

  checks.push({
    name: "running-balance-reconciliation",
    status: runningBalanceFailed ? "failed" : "passed",
    message: runningBalanceFailed ? "At least one transaction does not reconcile to its running balance." : undefined,
  });

  return checks;
}

export function fnbStatementsMateriallyAgree(left: BankStatement, right: BankStatement): boolean {
  return fnbStatementDifferenceFields(left, right).length === 0;
}

export function fnbStatementDifferenceFields(left: BankStatement, right: BankStatement): string[] {
  const differences: string[] = [];
  if (left.institution !== right.institution) {
    differences.push("institution");
  }
  if ((left.accountNumberMasked ?? null) !== (right.accountNumberMasked ?? null)) {
    differences.push("account-number");
  }
  if (JSON.stringify(left.period) !== JSON.stringify(right.period)) {
    differences.push("period");
  }
  if ((left.openingBalance ?? null) !== (right.openingBalance ?? null)) {
    differences.push("opening-balance");
  }
  if ((left.closingBalance ?? null) !== (right.closingBalance ?? null)) {
    differences.push("closing-balance");
  }
  if (JSON.stringify(canonicalTransactions(left)) !== JSON.stringify(canonicalTransactions(right))) {
    differences.push("transactions");
  }
  return differences;
}

function runStrategy(
  strategy: FnbStatementStrategy,
  lines: string[],
  extraction: "pdf-text" | "provided-text",
  pages?: number,
): FnbStrategyResult {
  const applicabilityEvidence = strategy.applicability(lines);
  const provenance: FnbStrategyProvenance = {
    family: strategy.family,
    version: strategy.version,
    extraction,
    lineCount: lines.length,
    ...(pages === undefined ? {} : { pages }),
    applicabilityEvidence,
  };

  if (applicabilityEvidence.length === 0) {
    return {
      strategy: strategy.name,
      family: strategy.family,
      version: strategy.version,
      applicable: false,
      ok: false,
      warnings: [],
      errors: [],
      checks: [],
      provenance,
    };
  }

  try {
    const parsed = parseStatement(lines, strategy.parseTransaction);
    const checks = buildFnbStatementChecks(parsed.statement);
    const failedChecks = checks.filter((check) => check.status === "failed");
    if (failedChecks.length > 0) {
      const reconciliationFailed = failedChecks.some((check) => check.name.includes("reconciliation"));
      return {
        strategy: strategy.name,
        family: strategy.family,
        version: strategy.version,
        applicable: true,
        ok: false,
        warnings: parsed.warnings,
        errors: [{
          code: reconciliationFailed ? "FNB_RECONCILIATION_FAILED" : "FNB_STRATEGY_INCOMPLETE",
          message: reconciliationFailed
            ? "The parsed statement did not pass reconciliation."
            : "The parsed statement did not contain all fields required by this layout.",
        }],
        checks,
        provenance,
      };
    }

    return {
      strategy: strategy.name,
      family: strategy.family,
      version: strategy.version,
      applicable: true,
      ok: true,
      statement: parsed.statement,
      warnings: parsed.warnings,
      errors: [],
      checks,
      provenance,
    };
  } catch (error) {
    return {
      strategy: strategy.name,
      family: strategy.family,
      version: strategy.version,
      applicable: true,
      ok: false,
      warnings: [],
      errors: [unknownError(error)],
      checks: [],
      provenance,
    };
  }
}

function parseStatement(
  lines: string[],
  parseTransaction: FnbStatementStrategy["parseTransaction"],
): { statement: BankStatement; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = [];
  const period = parsePeriod(findPeriod(lines));
  const openingBalance = parseOptionalSignedMoney(findBalanceValue(lines, "Opening Balance"));
  const closingBalance = parseOptionalSignedMoney(findBalanceValue(lines, "Closing Balance"));
  let previousBalance = openingBalance;
  const transactions: BankTransaction[] = [];

  for (const line of findTransactionLines(lines)) {
    if (isNonTransactionLine(line.text)) {
      continue;
    }

    const transaction = parseTransaction(line.text, { period, previousBalance });
    if (!transaction) {
      if (looksLikeDatedRow(line.text)) {
        throw new ToolboxError(
          "FNB_TRANSACTION_ROW_UNSUPPORTED",
          `A dated transaction row at extracted line ${line.lineNumber} did not match this layout version.`,
        );
      }

      warnings.push({
        code: "FNB_TRANSACTION_SKIPPED",
        message: `Skipped non-transaction content at extracted line ${line.lineNumber}.`,
      });
      continue;
    }

    const { amountWasInferred: _amountWasInferred, ...bankTransaction } = transaction;
    transactions.push(bankTransaction);
    previousBalance = transaction.balance;
  }

  if (transactions.length === 0) {
    throw new ToolboxError("FNB_NO_TRANSACTIONS", "No FNB transactions were parsed for this layout version.");
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

function compactAccountApplicability(lines: string[]): string[] {
  return evidenceWhen([
    ["statement-balances", lines.some((line) => /^Statement Balances$/i.test(line))],
    ["transactions-in-zar", lines.some((line) => /^Transactions in RAND \(ZAR\)/i.test(line))],
    ["compact-dated-row", lines.some((line) => /^\d{2}\s+[A-Za-z]{3}(?!\s+\d{4}).+\d[\d, ]*\.\d{2}(?:Cr|Dr)/i.test(line))],
  ]);
}

function evidenceWhen(requirements: [string, boolean][]): string[] {
  return requirements.every(([, matched]) => matched)
    ? requirements.map(([code]) => code)
    : [];
}

function normalizeLines(text: string): string[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
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
  const match = line.match(/^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([(-]?(?:R|ZAR)?\s?[\d,\s]+\.\d{2}\)?)\s+([(-]?(?:R|ZAR)?\s?[\d,\s]+\.\d{2}\)?\s*(?:Cr|Dr)?)\s*([A-Z0-9-]+)?$/i);
  if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
    return undefined;
  }

  const balance = parseSignedMoney(match[4]);
  return withInferredAmount({
    date: parseDate(match[1]),
    description: match[2].trim(),
    amount: parseTransactionAmount(match[3]),
    currency: "ZAR",
    balance,
    reference: match[5]?.trim(),
  }, context);
}

function parseCompactAccountTransaction(line: string, context: TransactionParseContext): ParsedTransaction | undefined {
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

  return withInferredAmount({
    date: parseDateInPeriod(match[1], context.period),
    description: split.description || "Bank Charges",
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
  const description = amountToken ? match[2].slice(0, amountToken.index).trim() : beforeBalance;
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

  throw new ToolboxError("FNB_PERIOD_MISSING", "Missing FNB statement period.");
}

function optionalMatch(lines: string[], pattern: RegExp): string | undefined {
  return lines.map((line) => line.match(pattern)).find(Boolean)?.[1]?.trim();
}

function findAccountNumber(lines: string[]): string | undefined {
  for (const line of lines) {
    const match = line.match(/^Account\s*:\s*(.+)$/i)
      ?? line.match(/^Account Number\s*:?\s*(.+)$/i)
      ?? line.match(/^.+\s+Account Number\s*:?\s*(.+)$/i)
      ?? line.match(/^.+ Account\s*:\s*(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return undefined;
}

function findBalanceValue(lines: string[], label: "Opening Balance" | "Closing Balance"): string | undefined {
  const labelPattern = new RegExp(`^${label}\\s*:?\\s*(.*)$`, "i");
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]?.match(labelPattern);
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

function findTransactionLines(lines: string[]): NumberedLine[] {
  const transactionLines: NumberedLine[] = [];
  let inTransactionSection = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }

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

    transactionLines.push({ text: line, lineNumber: index + 1 });
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

function looksLikeDatedRow(line: string): boolean {
  return /^(?:\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}|\d{1,2}\s+[A-Za-z]{3})\b/.test(line);
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
  for (const variant of amountTextVariants(Math.abs(amount))) {
    const escapedVariant = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = prefix.match(new RegExp(`^(.*)${escapedVariant}\\s*(?:Cr|Dr)?$`, "i"));
    if (match?.[1] !== undefined) {
      return { description: match[1].trim(), amount };
    }
  }

  return undefined;
}

function splitAmountFromLastToken(prefix: string): { description: string; amount: number } | undefined {
  const amountToken = findMoneyTokens(prefix).at(-1);
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
    throw new ToolboxError("FNB_PERIOD_INVALID", "The FNB statement period could not be parsed.");
  }
  return { from: parseDate(match[1]), to: parseDate(match[2]) };
}

function parseDate(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const numericMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (numericMatch?.[1] && numericMatch[2] && numericMatch[3]) {
    return `${numericMatch[3]}-${numericMatch[2]}-${numericMatch[1]}`;
  }

  const monthMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (monthMatch?.[1] && monthMatch[2] && monthMatch[3]) {
    return `${monthMatch[3]}-${monthNumber(monthMatch[2])}-${monthMatch[1].padStart(2, "0")}`;
  }

  throw new ToolboxError("FNB_DATE_INVALID", "An FNB statement date could not be parsed.");
}

function parseDateInPeriod(value: string, period: StatementPeriod): string {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]+)$/);
  if (!match?.[1] || !match[2]) {
    return parseDate(value);
  }

  const fromYear = Number(period.from.slice(0, 4));
  const toYear = Number(period.to.slice(0, 4));
  const month = monthNumber(match[2]);
  for (const year of fromYear === toYear ? [fromYear] : [fromYear, toYear]) {
    const candidate = `${year}-${month}-${match[1].padStart(2, "0")}`;
    if (candidate >= period.from && candidate <= period.to) {
      return candidate;
    }
  }

  throw new ToolboxError("FNB_TRANSACTION_DATE_OUTSIDE_PERIOD", "A transaction date falls outside the statement period.");
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
  return amount < 0 ? amount : -Math.abs(amount);
}

function parseMoney(value: string): number {
  const normalized = value.replace(/R|ZAR|\s|,/gi, "");
  const negativeMatch = normalized.match(/^\((.+)\)$/);
  const amount = Number(negativeMatch?.[1] ?? normalized);
  if (!Number.isFinite(amount)) {
    throw new ToolboxError("FNB_MONEY_INVALID", "An FNB monetary value could not be parsed.");
  }
  return negativeMatch ? -roundMoney(amount) : roundMoney(amount);
}

function looksLikeMoney(value: string): boolean {
  return /^(?:R|ZAR)?\s*\d[\d, ]*\.\d{2}\s*(?:Cr|Dr)?$/i.test(value.trim());
}

function monthNumber(value: string): string {
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(value.toLowerCase().slice(0, 3));
  if (month < 0) {
    throw new ToolboxError("FNB_MONTH_INVALID", "An FNB month name could not be parsed.");
  }
  return String(month + 1).padStart(2, "0");
}

function canonicalTransactions(statement: BankStatement): unknown[] {
  return statement.transactions.map((transaction) => ({
    date: transaction.date,
    description: transaction.description,
    amount: roundMoney(transaction.amount),
    currency: transaction.currency,
    balance: transaction.balance === undefined ? null : roundMoney(transaction.balance),
    reference: transaction.reference ?? null,
  }));
}
