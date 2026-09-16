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
    const parsed = parseEjoburgStatementText(text);
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

export function parseEjoburgStatementText(text: string): { statement: MunicipalStatement; warnings: ParseWarning[] } {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const warnings: ParseWarning[] = [];
  const charges = parseSection(lines, "Charges", "Payments", warnings, "EJOBURG_CHARGE_SKIPPED");
  const payments = parseSection(lines, "Payments", undefined, warnings, "EJOBURG_PAYMENT_SKIPPED");

  if (charges.length === 0 && payments.length === 0 && looksLikeCojTaxInvoice(lines)) {
    return parseCojTaxInvoiceText(lines);
  }

  if (looksLikeUnsupportedAdobeForm(lines)) {
    throw new Error("This eJoburg PDF is an Adobe dynamic form and exposes no statement text through the current extractor.");
  }

  if (charges.length === 0 && payments.length === 0) {
    throw new Error("No eJoburg charges or payments were parsed.");
  }

  return {
    statement: {
      municipality: "City of Johannesburg",
      accountNumber: optionalMatch(lines, /^(?:Account|Account Number):\s*(.+)$/i),
      billingPeriod: parsePeriod(requiredMatch(lines, /^(?:Billing Period|Statement Period):\s*(.+)$/i, "Missing eJoburg billing period.")),
      openingBalance: parseOptionalMoney(optionalMatch(lines, /^Opening Balance:?\s*(.+)$/i)),
      closingBalance: parseOptionalMoney(optionalMatch(lines, /^Closing Balance:?\s*(.+)$/i)),
      charges,
      payments,
    },
    warnings,
  };
}

function parseCojTaxInvoiceText(lines: string[]): { statement: MunicipalStatement; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = [];
  const summaryAmounts = parseSummaryAmounts(lines);
  const billingPeriod = parseCojBillingPeriod(lines);
  const charges = parseCojChargeLines(lines, warnings, billingPeriod.from);

  if (charges.length === 0) {
    throw new Error("No City of Johannesburg tax-invoice charges were parsed.");
  }

  const currentCharges = summaryAmounts.get("current charges (excl. vat)") ?? sumChargesExcludingVat(charges);
  const vat = summaryAmounts.get("vat @ 15%") ?? sumVatCharges(charges);

  return {
    statement: {
      municipality: "City of Johannesburg",
      accountNumber: parseCojAccountNumber(lines),
      billingPeriod,
      openingBalance: summaryAmounts.get("previous account balance"),
      closingBalance: findLabeledMoney(lines, [/^Total Due\b/i, /^TOTAL AMOUNT OUTSTANDING\b/i]),
      charges,
      payments: [],
    },
    warnings: [
      ...warnings,
      ...(amountsEqual(roundMoney(currentCharges + vat), roundMoney(charges.reduce((sum, item) => sum + item.amount, 0)))
        ? []
        : [{
          code: "EJOBURG_CURRENT_CHARGES_MISMATCH",
          message: "Parsed charge lines do not match the current charges summary.",
        } satisfies ParseWarning]),
    ],
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
  if (/^(date|transaction date)\b/i.test(line)) {
    return undefined;
  }

  const parts = line.split("|").map((part) => part.trim());
  if (parts.length >= 3) {
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

  const compactMatch = line.match(/^(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([(-]?(?:R|ZAR)?\s?[\d,\s]+\.\d{2}\)?)\s*([A-Z0-9-]+)?$/i);
  if (!compactMatch?.[1] || !compactMatch[2] || !compactMatch[3]) {
    return undefined;
  }

  return {
    date: parseDate(compactMatch[1]),
    description: compactMatch[2].trim(),
    amount: parseMoney(compactMatch[3]),
    currency: "ZAR",
    reference: compactMatch[4]?.trim(),
  };
}

function looksLikeCojTaxInvoice(lines: string[]): boolean {
  return lines.some((line) => /^TAX INVOICE$/i.test(line))
    && lines.some((line) => /^Account Number:/i.test(line))
    && lines.some((line) => /^Statement for/i.test(line));
}

function looksLikeUnsupportedAdobeForm(lines: string[]): boolean {
  return lines.some((line) => /requires Adobe Reader 8 or higher/i.test(line))
    && lines.some((line) => /go\/pdf_forms_configure/i.test(line));
}

function parseCojAccountNumber(lines: string[]): string | undefined {
  return optionalMatch(lines, /^Account Number:\s*(\d+)/i) ?? optionalMatch(lines, /^Acc\.\s*No\.:\s*(\d+)/i);
}

function parseCojBillingPeriod(lines: string[]): StatementPeriod {
  const explicitPeriod = optionalMatch(lines, /\(\s*Billing Period\s+(\d{4}\/\d{2})\s*\)/i);
  const statementMonth = optionalMatch(lines, /^Statement for\s*(.+)$/i);
  return parseMonthPeriod(explicitPeriod ?? statementMonth ?? requiredMatch(lines, /^Date\s*(\d{4}\/\d{2}\/\d{2})$/i, "Missing City of Johannesburg statement period."));
}

function parseSummaryAmounts(lines: string[]): Map<string, number> {
  const result = new Map<string, number>();
  const startIndex = lines.findIndex((line) => /^Previous Account Balance$/i.test(line));
  if (startIndex < 0) {
    return result;
  }

  const labels: string[] = [];
  let index = startIndex;
  while (index < lines.length && !parseMoneyFromLine(lines[index])) {
    const line = lines[index];
    if (line) {
      labels.push(line.toLowerCase());
    }
    index += 1;
  }

  for (const label of labels) {
    const amount = parseMoneyFromLine(lines[index]);
    if (amount === undefined) {
      break;
    }
    result.set(label, amount);
    index += 1;
  }

  return result;
}

function parseCojChargeLines(lines: string[], warnings: ParseWarning[], fallbackDate: string): MunicipalLineItem[] {
  const charges: MunicipalLineItem[] = [];
  let category: string | undefined;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, " ").trim();

    const heading = line.match(/^(.+?)VAT\s+\d{10}Sub\s*-\s*TotalTotal$/i);
    if (heading?.[1]) {
      category = heading[1].trim();
      continue;
    }

    if (/^PIKITUP$/i.test(line)) {
      category = "PIKITUP";
      continue;
    }

    if (!category || shouldSkipCojChargeLine(line)) {
      continue;
    }

    const item = parseCojChargeLine(line, category, fallbackDate);
    if (item) {
      if (item.amount !== 0) {
        charges.push(item);
      }
      continue;
    }

    if (looksLikePossibleChargeLine(line)) {
      warnings.push({ code: "EJOBURG_CHARGE_SKIPPED", message: `Skipped unrecognized charge line in ${category}.` });
    }
  }

  return charges;
}

function parseCojChargeLine(line: string, category: string, fallbackDate: string): MunicipalLineItem | undefined {
  const vatMatch = line.match(/^VAT:\s*([0-9.]+)\s*%?\s*(-?\s?[\d,]+\.\d{2})/i);
  if (vatMatch?.[1] && vatMatch[2]) {
    return {
      date: parseCojLineItemDate(line, fallbackDate),
      description: `${category}: VAT ${vatMatch[1]}%`,
      amount: parseMoney(vatMatch[2]),
      currency: "ZAR",
    };
  }

  const amountMatch = line.match(/^(.+?)(-?\s?[\d,]+\.\d{2})$/);
  if (!amountMatch?.[1] || !amountMatch[2]) {
    return undefined;
  }

  const description = amountMatch[1].trim();
  if (/^(Sub\s*-\s*Total|Total|Amount)$/i.test(description)) {
    return undefined;
  }

  return {
    date: parseCojLineItemDate(line, fallbackDate),
    description: `${category}: ${description}`,
    amount: parseMoney(amountMatch[2]),
    currency: "ZAR",
  };
}

function shouldSkipCojChargeLine(line: string): boolean {
  return /^(Amount|Sub\s*-\s*Total|Total|Current Charges\b|Where can a payment be made\?|YOUR ACCOUNT NUMBER IS YOUR REFERENCE NUMBER)/i.test(line)
    || /^The property rates are based/i.test(line)
    || /^are calculated as follows:?$/i.test(line);
}

function looksLikePossibleChargeLine(line: string): boolean {
  return /\d+\.\d{2}$/.test(line) || /^VAT:/i.test(line);
}

function parseCojLineItemDate(line: string, fallbackDate: string): string {
  const period = line.match(/\(\s*Billing Period\s+(\d{4}\/\d{2})\s*\)/i)?.[1];
  return period ? parseMonthPeriod(period).from : fallbackDate;
}

function sumChargesExcludingVat(charges: MunicipalLineItem[]): number {
  return roundMoney(charges.filter((item) => !/\bVAT\b/i.test(item.description)).reduce((sum, item) => sum + item.amount, 0));
}

function sumVatCharges(charges: MunicipalLineItem[]): number {
  return roundMoney(charges.filter((item) => /\bVAT\b/i.test(item.description)).reduce((sum, item) => sum + item.amount, 0));
}

function findLabeledMoney(lines: string[], labelPatterns: RegExp[]): number | undefined {
  for (const pattern of labelPatterns) {
    const index = lines.findIndex((line) => pattern.test(line));
    if (index < 0) {
      continue;
    }

    const inline = parseMoneyFromLine(lines[index]?.replace(pattern, "") ?? "");
    if (inline !== undefined) {
      return inline;
    }

    for (const candidate of lines.slice(index + 1, index + 4)) {
      const amount = parseMoneyFromLine(candidate);
      if (amount !== undefined) {
        return amount;
      }
    }
  }

  return undefined;
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
  const match = value.match(/^(.+?)\s+(?:to|-)\s+(.+)$/i);
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid billing period: ${value}`);
  }
  return { from: parseDate(match[1]), to: parseDate(match[2]) };
}

function parseMonthPeriod(value: string): StatementPeriod {
  const trimmed = value.trim();
  const numeric = trimmed.match(/^(\d{4})\/(\d{2})(?:\/\d{2})?$/);
  if (numeric?.[1] && numeric[2]) {
    return monthPeriod(Number(numeric[1]), Number(numeric[2]));
  }

  const named = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (named?.[1] && named[2]) {
    const month = monthNumber(named[1]);
    return monthPeriod(Number(named[2]), month);
  }

  throw new Error(`Invalid statement month: ${value}`);
}

function monthNumber(value: string): number {
  const month = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].indexOf(value.toLowerCase()) + 1;

  if (month === 0) {
    throw new Error(`Invalid month: ${value}`);
  }
  return month;
}

function monthPeriod(year: number, month: number): StatementPeriod {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Invalid statement month: ${year}/${month}`);
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad2(month)}-01`,
    to: `${year}-${pad2(month)}-${pad2(lastDay)}`,
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
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
  const normalized = normalizeMoney(value);
  const negativeMatch = normalized.match(/^\((.+)\)$/);
  const amount = Number(negativeMatch?.[1] ?? normalized);

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid money amount: ${value}`);
  }

  return negativeMatch ? -roundMoney(amount) : roundMoney(amount);
}

function parseMoneyFromLine(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.trim().match(/(?:R|ZAR)?\s*(?:\(\s*[\d,\s]+\.\d{2}\s*\)|-\s*[\d,\s]+\.\d{2}|[\d,\s]+\.\d{2})/i);
  return match?.[0] ? parseMoney(match[0]) : undefined;
}

function normalizeMoney(value: string): string {
  const withoutCurrency = value.replace(/R|ZAR/gi, "").replace(/\s|,/g, "");
  return withoutCurrency.replace(/^-(\d)/, "-$1");
}
