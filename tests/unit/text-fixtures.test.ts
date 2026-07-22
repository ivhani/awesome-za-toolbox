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
