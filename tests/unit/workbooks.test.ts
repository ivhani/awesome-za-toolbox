import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOrUpdateCojWorkbook } from "@awesome-za/workbooks";
import ExcelJS from "exceljs";
import { createSyntheticPdf, createTempDir } from "../helpers/synthetic-pdf.ts";

test("creates a COJ workbook from a folder and keeps review rows for bad PDFs", async () => {
  const dir = await createTempDir("za-toolbox-coj-workbook-");
  const inputDirectory = path.join(dir, "statements");
  const workbookPath = path.join(dir, "tax-workbook.xlsx");
  await mkdir(inputDirectory);
  await createSyntheticPdf(path.join(inputDirectory, "coj-2026-01.pdf"), statementLines());
  await writeFile(path.join(inputDirectory, "coj-unreadable.pdf"), "not a pdf");

  const result = await createOrUpdateCojWorkbook({ inputDirectory, workbookPath });

  assert.equal(result.filesDiscovered, 2);
  assert.equal(result.statementsParsed, 1);
  assert.equal(result.reviewRequired, 1);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.getWorksheet("COJ");
  assert.ok(sheet);
  assert.equal(sheet.rowCount, 3);
  assert.deepEqual((sheet.getRow(2).values as ExcelJS.CellValue[]).slice(1), [
    2026,
    1,
    100,
    300,
    200,
    80,
    50,
    25,
    -150,
    500,
    1105,
    "coj-2026-01.pdf",
    "OK",
  ]);
  assert.match(String(sheet.getRow(3).getCell(13).value), /INVALID_PDF/);
  assert.equal(sheet.getCell("C2").numFmt, "R #,##0.00;[Red]-R #,##0.00");
  assert.equal(sheet.autoFilter, "A1:M1");
});

test("preserves existing worksheets when adding the COJ sheet", async () => {
  const dir = await createTempDir("za-toolbox-existing-workbook-");
  const inputDirectory = path.join(dir, "statements");
  const workbookPath = path.join(dir, "tax-workbook.xlsx");
  await mkdir(inputDirectory);
  await createSyntheticPdf(path.join(inputDirectory, "coj-2026-01.pdf"), statementLines());

  const original = new ExcelJS.Workbook();
  const fnb = original.addWorksheet("FNB");
  fnb.getCell("A1").value = "Existing data";
  await original.xlsx.writeFile(workbookPath);

  await createOrUpdateCojWorkbook({ inputDirectory, workbookPath });

  const updated = new ExcelJS.Workbook();
  await updated.xlsx.readFile(workbookPath);
  assert.deepEqual(updated.worksheets.map((sheet) => sheet.name), ["FNB", "COJ"]);
  assert.equal(updated.getWorksheet("FNB")?.getCell("A1").value, "Existing data");
});

function statementLines(): string[] {
  return [
    "CITY OF JOHANNESBURG MUNICIPAL STATEMENT",
    "Account: 123456789",
    "Billing Period: 2026-01-01 to 2026-01-31",
    "Opening Balance: 500.00",
    "Closing Balance: 1105.00",
    "Charges:",
    "2026-01-03 | Electricity usage | 300.00 | ELEC",
    "2026-01-04 | Water consumption | 100.00 | WATER",
    "2026-01-05 | Property Rates | 200.00 | RATES",
    "2026-01-06 | Sewerage | 80.00 | SEWER",
    "2026-01-07 | Pikitup refuse | 50.00 | REFUSE",
    "2026-01-08 | Sundry fee | 25.00 | OTHER",
    "Payments:",
    "2026-01-20 | Payment received | -150.00 | EFT",
  ];
}
