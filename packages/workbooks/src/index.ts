import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { ToolboxError, roundMoney, type ParseResult } from "@awesome-za/core";
import { parseEjoburgStatement } from "@awesome-za/ejoburg";
import type { MunicipalLineItem, MunicipalStatement } from "@awesome-za/schemas";
import ExcelJS from "exceljs";

const COJ_SHEET_NAME = "COJ";
const REVIEW_OK = "OK";

export interface CojWorkbookInput {
  inputDirectory: string;
  workbookPath: string;
}

export interface CojWorkbookRow {
  year?: number;
  month?: number;
  water?: number;
  electricity?: number;
  ratesAndTaxes?: number;
  sewerage?: number;
  refuse?: number;
  otherCharges?: number;
  payments?: number;
  openingBalance?: number;
  closingBalance?: number;
  sourceFileName: string;
  reviewStatus: string;
}

export interface CojWorkbookResult {
  workbookPath: string;
  filesDiscovered: number;
  statementsParsed: number;
  reviewRequired: number;
  rows: CojWorkbookRow[];
}

type ChargeCategory = "water" | "electricity" | "ratesAndTaxes" | "sewerage" | "refuse" | "otherCharges";

export async function createOrUpdateCojWorkbook(input: CojWorkbookInput): Promise<CojWorkbookResult> {
  const pdfFiles = await discoverPdfFiles(input.inputDirectory);
  if (pdfFiles.length === 0) {
    throw new ToolboxError("NO_PDF_FILES", `No PDF files found in: ${input.inputDirectory}`);
  }

  const parsed = await Promise.all(pdfFiles.map(async (filePath) => ({
    filePath,
    result: await parseEjoburgStatement({ filePath }),
  })));
  const rows = parsed.map(({ result }) => summarizeCojStatement(result)).sort(compareRows);

  await writeWorkbook(input.workbookPath, rows);

  return {
    workbookPath: input.workbookPath,
    filesDiscovered: pdfFiles.length,
    statementsParsed: rows.filter((row) => row.year !== undefined).length,
    reviewRequired: rows.filter((row) => row.reviewStatus !== REVIEW_OK).length,
    rows,
  };
}

export function summarizeCojStatement(result: ParseResult<MunicipalStatement>): CojWorkbookRow {
  if (!result.ok || !result.data) {
    return {
      sourceFileName: result.metadata.sourceFileName,
      reviewStatus: reviewText(result),
    };
  }

  const [yearText, monthText] = result.data.billingPeriod.from.split("-");
  const totals: Record<ChargeCategory, number> = {
    water: 0,
    electricity: 0,
    ratesAndTaxes: 0,
    sewerage: 0,
    refuse: 0,
    otherCharges: 0,
  };

  for (const charge of result.data.charges) {
    const category = classifyCharge(charge);
    totals[category] = roundMoney(totals[category] + charge.amount);
  }

  return {
    year: Number(yearText),
    month: Number(monthText),
    ...totals,
    payments: roundMoney(result.data.payments.reduce((sum, payment) => sum + payment.amount, 0)),
    openingBalance: result.data.openingBalance,
    closingBalance: result.data.closingBalance,
    sourceFileName: result.metadata.sourceFileName,
    reviewStatus: reviewText(result),
  };
}

function classifyCharge(charge: MunicipalLineItem): ChargeCategory {
  const description = charge.description.toLowerCase();
  if (description.includes("water")) return "water";
  if (/electricity|electric|power/.test(description)) return "electricity";
  if (/property rates|rates and taxes|\brates\b/.test(description)) return "ratesAndTaxes";
  if (/sewerage|\bsewer\b|sanitation/.test(description)) return "sewerage";
  if (/refuse|pikitup|\bwaste\b/.test(description)) return "refuse";
  return "otherCharges";
}

function reviewText(result: ParseResult<MunicipalStatement>): string {
  const issues = [
    ...result.errors.map((error) => `${error.code}: ${error.message}`),
    ...result.warnings.map((warning) => `${warning.code}: ${warning.message}`),
    ...result.metadata.checks
      .filter((check) => check.status !== "passed")
      .map((check) => `${check.name} ${check.status}${check.message ? `: ${check.message}` : ""}`),
  ];
  return issues.length === 0 ? REVIEW_OK : `Review: ${issues.join(" | ")}`;
}

async function discoverPdfFiles(inputDirectory: string): Promise<string[]> {
  let directoryStat;
  try {
    directoryStat = await stat(inputDirectory);
  } catch {
    throw new ToolboxError("DIRECTORY_NOT_READABLE", `Directory is missing or not readable: ${inputDirectory}`);
  }
  if (!directoryStat.isDirectory()) {
    throw new ToolboxError("NOT_A_DIRECTORY", `Input path is not a directory: ${inputDirectory}`);
  }

  const entries = await readdir(inputDirectory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".pdf")
    .map((entry) => path.join(inputDirectory, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right), "en", { numeric: true }));
}

function compareRows(left: CojWorkbookRow, right: CojWorkbookRow): number {
  const leftPeriod = left.year === undefined || left.month === undefined ? Number.MAX_SAFE_INTEGER : left.year * 100 + left.month;
  const rightPeriod = right.year === undefined || right.month === undefined ? Number.MAX_SAFE_INTEGER : right.year * 100 + right.month;
  return leftPeriod - rightPeriod || left.sourceFileName.localeCompare(right.sourceFileName, "en", { numeric: true });
}

async function writeWorkbook(workbookPath: string, rows: CojWorkbookRow[]): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  if (await fileExists(workbookPath)) {
    await workbook.xlsx.readFile(workbookPath);
  }
  if (workbook.getWorksheet(COJ_SHEET_NAME)) {
    throw new ToolboxError("WORKSHEET_EXISTS", `Worksheet already exists: ${COJ_SHEET_NAME}`);
  }

  addCojWorksheet(workbook, rows);
  const destination = path.resolve(workbookPath);
  await mkdir(path.dirname(destination), { recursive: true });
  const temporaryPath = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp.xlsx`);

  try {
    await workbook.xlsx.writeFile(temporaryPath);
    await validateWorkbook(temporaryPath, rows.length);
    await rename(temporaryPath, destination);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function addCojWorksheet(workbook: ExcelJS.Workbook, rows: CojWorkbookRow[]): void {
  const worksheet = workbook.addWorksheet(COJ_SHEET_NAME, {
    properties: { tabColor: { argb: "FF1F4E78" } },
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });

  worksheet.columns = [
    { header: "Year", key: "year", width: 10 },
    { header: "Month", key: "month", width: 10 },
    { header: "Water", key: "water", width: 15 },
    { header: "Electricity", key: "electricity", width: 15 },
    { header: "Rates and taxes", key: "ratesAndTaxes", width: 17 },
    { header: "Sewerage", key: "sewerage", width: 15 },
    { header: "Refuse", key: "refuse", width: 15 },
    { header: "Other charges", key: "otherCharges", width: 17 },
    { header: "Payments", key: "payments", width: 15 },
    { header: "Opening balance", key: "openingBalance", width: 18 },
    { header: "Closing balance", key: "closingBalance", width: 18 },
    { header: "Source filename", key: "sourceFileName", width: 34 },
    { header: "Review status", key: "reviewStatus", width: 70 },
  ];

  worksheet.addRows(rows);
  worksheet.autoFilter = { from: "A1", to: "M1" };
  worksheet.getRow(1).height = 24;
  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.font = { name: "Arial", size: 10, color: { argb: "FF1F2937" } };
    row.alignment = { vertical: "middle" };
    for (let columnNumber = 3; columnNumber <= 11; columnNumber += 1) {
      row.getCell(columnNumber).numFmt = 'R #,##0.00;[Red]-R #,##0.00';
    }
    row.getCell(13).alignment = { vertical: "top", wrapText: true };
    if (row.getCell(13).value !== REVIEW_OK) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF2CC" } };
      row.getCell(13).font = { name: "Arial", size: 10, bold: true, color: { argb: "FF9C5700" } };
    }
  }
}

async function validateWorkbook(filePath: string, expectedRows: number): Promise<void> {
  const validation = new ExcelJS.Workbook();
  await validation.xlsx.readFile(filePath);
  const worksheet = validation.getWorksheet(COJ_SHEET_NAME);
  if (!worksheet || worksheet.rowCount !== expectedRows + 1) {
    throw new ToolboxError("WORKBOOK_VALIDATION_FAILED", "Generated workbook did not contain the expected COJ data.");
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
