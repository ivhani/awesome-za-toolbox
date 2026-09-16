import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseEjoburgStatementText } from "@awesome-za/ejoburg";
import { parseFnbStatementText } from "@awesome-za/fnb";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("parses sanitized FNB extracted-text fixture", async () => {
  const text = await readFile(path.join(repoRoot, "tests/fixtures/text/fnb-sanitized-layout.txt"), "utf8");
  const parsed = parseFnbStatementText(text);

  assert.equal(parsed.warnings.length, 1);
  assert.equal(parsed.warnings[0]?.code, "FNB_TRANSACTION_SKIPPED");
  assert.equal(parsed.statement.period.from, "2026-01-01");
  assert.equal(parsed.statement.period.to, "2026-01-31");
  assert.equal(parsed.statement.transactions.length, 2);
  assert.equal(parsed.statement.transactions[1]?.balance, 1250);
});

test("parses sanitized FNB current-account extracted layout", async () => {
  const text = await readFile(path.join(repoRoot, "tests/fixtures/text/fnb-current-account-extracted-layout.txt"), "utf8");
  const parsed = parseFnbStatementText(text);

  assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.statement.accountNumberMasked, "00000000000");
  assert.deepEqual(parsed.statement.period, { from: "2025-03-20", to: "2025-04-19" });
  assert.equal(parsed.statement.openingBalance, 71810);
  assert.equal(parsed.statement.closingBalance, 62780);
  assert.deepEqual(parsed.statement.transactions.map((transaction) => transaction.amount), [-10000, 2000, -1000, -30]);
  assert.equal(parsed.statement.transactions.at(-1)?.balance, 62780);
});

test("parses sanitized FNB business-account extracted layout", async () => {
  const text = await readFile(path.join(repoRoot, "tests/fixtures/text/fnb-business-account-extracted-layout.txt"), "utf8");
  const parsed = parseFnbStatementText(text);

  assert.equal(parsed.warnings.length, 0);
  assert.deepEqual(parsed.statement.period, { from: "2025-06-30", to: "2025-07-31" });
  assert.equal(parsed.statement.openingBalance, 4919.57);
  assert.equal(parsed.statement.closingBalance, 8415.07);
  assert.deepEqual(parsed.statement.transactions.map((transaction) => transaction.amount), [-1500, 5000, 0, -4.5]);
  assert.equal(parsed.statement.transactions.at(-1)?.description, "Bank Charges");
});

test("parses sanitized FNB home-loan extracted layout", async () => {
  const text = await readFile(path.join(repoRoot, "tests/fixtures/text/fnb-home-loan-extracted-layout.txt"), "utf8");
  const parsed = parseFnbStatementText(text);

  assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.statement.accountNumberMasked, "0-000-000-000-000");
  assert.deepEqual(parsed.statement.period, { from: "2024-09-15", to: "2024-12-07" });
  assert.equal(parsed.statement.openingBalance, -80554.85);
  assert.equal(parsed.statement.closingBalance, -71899.98);
  assert.deepEqual(parsed.statement.transactions.map((transaction) => transaction.amount), [0, 3000, -745.77, 6469.64, -69]);
  assert.equal(parsed.statement.transactions.at(-1)?.balance, -71899.98);
});

test("parses sanitized eJoburg extracted-text fixture", async () => {
  const text = await readFile(path.join(repoRoot, "tests/fixtures/text/ejoburg-sanitized-layout.txt"), "utf8");
  const parsed = parseEjoburgStatementText(text);

  assert.equal(parsed.warnings.length, 2);
  assert.equal(parsed.warnings[0]?.code, "EJOBURG_CHARGE_SKIPPED");
  assert.equal(parsed.statement.billingPeriod.from, "2026-01-01");
  assert.equal(parsed.statement.billingPeriod.to, "2026-01-31");
  assert.equal(parsed.statement.charges.length, 2);
  assert.equal(parsed.statement.payments.length, 1);
});

test("parses sanitized City of Johannesburg tax-invoice extracted-text fixture", async () => {
  const text = await readFile(path.join(repoRoot, "tests/fixtures/text/ejoburg-coj-tax-invoice-sanitized-layout.txt"), "utf8");
  const parsed = parseEjoburgStatementText(text);

  assert.equal(parsed.warnings.length, 0);
  assert.equal(parsed.statement.accountNumber, "558000000");
  assert.deepEqual(parsed.statement.billingPeriod, { from: "2026-06-01", to: "2026-06-30" });
  assert.equal(parsed.statement.openingBalance, -1303.11);
  assert.equal(parsed.statement.closingBalance, -499.22);
  assert.equal(parsed.statement.charges.length, 5);
  assert.equal(parsed.statement.payments.length, 0);
  assert.equal(parsed.statement.charges.reduce((sum, item) => Math.round((sum + item.amount) * 100) / 100, 0), 803.89);
});

test("reports Adobe dynamic-form eJoburg PDFs as unsupported extracted text", async () => {
  const text = await readFile(path.join(repoRoot, "tests/fixtures/text/ejoburg-adobe-form-placeholder.txt"), "utf8");

  assert.throws(
    () => parseEjoburgStatementText(text),
    /Adobe dynamic form/,
  );
});
