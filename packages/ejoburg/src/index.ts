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
import type { MunicipalLineItem, MunicipalStatement, StatementPeriod } from "@awesome-za/schemas";

const PARSER_NAME = "@awesome-za/ejoburg";
const PARSER_VERSION = "0.1.0";

export async function parse(input: ParseInput): Promise<ParseResult<MunicipalStatement>> {
  return parseEjoburgStatement(input);
}

export async function parseEjoburgStatement(input: ParseInput): Promise<ParseResult<MunicipalStatement>> {
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

function parseText(text: string): { statement: MunicipalStatement; warnings: ParseWarning[] } {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const warnings: ParseWarning[] = [];
  const charges = parseSection(lines, "Charges", "Payments", warnings, "EJOBURG_CHARGE_SKIPPED");
  const payments = parseSection(lines, "Payments", undefined, warnings, "EJOBURG_PAYMENT_SKIPPED");

  if (charges.length === 0 && payments.length === 0) {
    throw new Error("No eJoburg charges or payments were parsed.");
  }

  return {
    statement: {
      municipality: "City of Johannesburg",
      accountNumber: optionalMatch(lines, /^Account:\s*(.+)$/i),
      billingPeriod: parsePeriod(requiredMatch(lines, /^Billing Period:\s*(.+)$/i, "Missing eJoburg billing period.")),
      openingBalance: parseOptionalMoney(optionalMatch(lines, /^Opening Balance:\s*(.+)$/i)),
      closingBalance: parseOptionalMoney(optionalMatch(lines, /^Closing Balance:\s*(.+)$/i)),
      charges,
      payments,
    },
    warnings,
  };
}

function parseSection(
  lines: string[],
  startLabel: string,
  endLabel: string | undefined,
  warnings: ParseWarning[],
  warningCode: string,
): MunicipalLineItem[] {
  const startIndex = lines.findIndex((line) => new RegExp(`^${startLabel}:?$`, "i").test(line));
  if (startIndex < 0) {
    return [];
  }

  const rest = lines.slice(startIndex + 1);
  const endIndex = endLabel ? rest.findIndex((line) => new RegExp(`^${endLabel}:?$`, "i").test(line)) : -1;
  const sectionLines = endIndex >= 0 ? rest.slice(0, endIndex) : rest;

  return sectionLines.flatMap((line) => {
    const item = parseLineItem(line);
    if (!item) {
      warnings.push({ code: warningCode, message: `Skipped unrecognized line: ${line}` });
      return [];
    }
    return [item];
  });
}

function parseLineItem(line: string): MunicipalLineItem | undefined {
  const parts = line.split("|").map((part) => part.trim());
  if (parts.length < 3) {
    return undefined;
  }

  const [date, description, amount, reference] = parts;
  if (!date || !description || !amount) {
    return undefined;
  }

  return {
    date: parseDate(date),
    description,
    amount: parseMoney(amount),
    currency: "ZAR",
    reference: reference || undefined,
  };
}

function buildChecks(statement: MunicipalStatement): ParseCheck[] {
  if (statement.openingBalance === undefined || statement.closingBalance === undefined) {
    return [{
      name: "municipal-balance-reconciliation",
      status: "skipped",
      message: "Opening or closing balance is missing.",
    }];
  }

  const chargeTotal = statement.charges.reduce((sum, item) => sum + item.amount, 0);
  const paymentTotal = statement.payments.reduce((sum, item) => sum + item.amount, 0);
  const expectedClosing = roundMoney(statement.openingBalance + chargeTotal + paymentTotal);

  return [{
    name: "municipal-balance-reconciliation",
    status: amountsEqual(expectedClosing, statement.closingBalance) ? "passed" : "failed",
    message: `Expected closing balance ${expectedClosing}; parsed ${statement.closingBalance}.`,
  }];
}

function checksToWarnings(checks: ParseCheck[]): ParseWarning[] {
  return checks
    .filter((check) => check.status === "failed")
    .map((check) => ({ code: "EJOBURG_RECONCILIATION_FAILED", message: check.message ?? `${check.name} failed.` }));
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
    throw new Error(`Invalid billing period: ${value}`);
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
