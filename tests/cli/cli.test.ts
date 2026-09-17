import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { createSyntheticPdf, createSyntheticXfaPdf, createTempDir, syntheticCojXfaDataset } from "../helpers/synthetic-pdf.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cliEntry = path.join(repoRoot, "apps/cli/src/index.ts");

test("CLI writes FNB JSON output", async () => {
  const dir = await createTempDir("za-toolbox-cli-json-");
  const input = path.join(dir, "statement.pdf");
  const output = path.join(dir, "statement.json");
  await createSyntheticPdf(input, [
    "FNB BANK STATEMENT",
    "Account: ****1234",
    "Period: 2026-01-01 to 2026-01-31",
    "Opening Balance: 1000.00",
    "Closing Balance: 1250.00",
    "Transactions:",
    "2026-01-05 | Grocery Store | -250.00 | 750.00 | CARD123",
    "2026-01-10 | Salary | 500.00 | 1250.00 | EFT456",
  ]);

  const result = runCli(["bank", "fnb", "parse", input, "--format", "json", "--output", output]);

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(await readFile(output, "utf8")) as { ok: boolean; data: { institution: string } };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.institution, "FNB");
});

test("CLI writes eJoburg CSV output", async () => {
  const dir = await createTempDir("za-toolbox-cli-csv-");
  const input = path.join(dir, "invoice.pdf");
  const output = path.join(dir, "invoice.csv");
  await createSyntheticPdf(input, [
    "CITY OF JOHANNESBURG MUNICIPAL STATEMENT",
    "Account: 123456789",
    "Billing Period: 2026-01-01 to 2026-01-31",
    "Opening Balance: 500.00",
    "Closing Balance: 750.00",
    "Charges:",
    "2026-01-03 | Electricity | 300.00 | ELEC",
    "2026-01-04 | Water | 100.00 | WATER",
    "Payments:",
    "2026-01-20 | Payment received | -150.00 | EFT",
  ]);

  const result = runCli(["municipal", "ejoburg", "parse", input, "--format", "csv", "--output", output]);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(output, "utf8"), [
    "type,date,description,amount,currency,reference",
    "charge,2026-01-03,Electricity,300,ZAR,ELEC",
    "charge,2026-01-04,Water,100,ZAR,WATER",
    "payment,2026-01-20,Payment received,-150,ZAR,EFT",
    "",
  ].join("\n"));
});

test("CLI writes eJoburg JSON output from a COJ XFA dynamic-form PDF", async () => {
  const dir = await createTempDir("za-toolbox-cli-xfa-json-");
  const input = path.join(dir, "xfa-invoice.pdf");
  const output = path.join(dir, "xfa-invoice.json");
  await createSyntheticXfaPdf(input, syntheticCojXfaDataset());

  const result = runCli(["municipal", "ejoburg", "parse", input, "--format", "json", "--output", output]);

  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(await readFile(output, "utf8")) as {
    ok: boolean;
    data: { municipality: string; accountNumber: string; charges: unknown[]; payments: unknown[] };
  };
  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.municipality, "City of Johannesburg");
  assert.equal(parsed.data.accountNumber, "999000111");
  assert.equal(parsed.data.charges.length, 3);
  assert.equal(parsed.data.payments.length, 1);
});

test("CLI fails for missing input files", () => {
  const result = runCli(["bank", "fnb", "parse", "missing.pdf", "--format", "json"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /FILE_NOT_READABLE/);
});

test("CLI fails for unsupported output formats", () => {
  const result = runCli(["bank", "fnb", "parse", "missing.pdf", "--format", "xml"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsupported format/);
});

test("CLI extracts PDF text for private fixture inspection", async () => {
  const dir = await createTempDir("za-toolbox-cli-extract-");
  const input = path.join(dir, "statement.pdf");
  const output = path.join(dir, "statement.txt");
  await createSyntheticPdf(input, [
    "FNB BANK STATEMENT",
    "Account Number: ****1234",
  ]);

  const result = runCli(["dev", "extract-text", input, "--output", output]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(output, "utf8"), /FNB BANK STATEMENT/);
});

test("CLI writes a COJ workbook from a folder", async () => {
  const dir = await createTempDir("za-toolbox-cli-workbook-");
  const inputDirectory = path.join(dir, "statements");
  const output = path.join(dir, "tax-workbook.xlsx");
  await mkdir(inputDirectory);
  await createSyntheticPdf(path.join(inputDirectory, "coj.pdf"), [
    "CITY OF JOHANNESBURG MUNICIPAL STATEMENT",
    "Account: 123456789",
    "Billing Period: 2026-01-01 to 2026-01-31",
    "Opening Balance: 500.00",
    "Closing Balance: 750.00",
    "Charges:",
    "2026-01-03 | Electricity | 300.00 | ELEC",
    "2026-01-04 | Water | 100.00 | WATER",
    "Payments:",
    "2026-01-20 | Payment received | -150.00 | EFT",
  ]);

  const result = runCli(["municipal", "ejoburg", "workbook", inputDirectory, "--output", output]);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Wrote 1 statement/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(output);
  assert.equal(workbook.getWorksheet("COJ")?.getCell("A2").value, 2026);
});

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
