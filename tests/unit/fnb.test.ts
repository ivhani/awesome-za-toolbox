import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseFnbStatement } from "@awesome-za/fnb";
import { createSyntheticPdf, createTempDir } from "../helpers/synthetic-pdf.ts";

test("parses a synthetic FNB statement PDF", async () => {
  const dir = await createTempDir("za-toolbox-fnb-");
  const filePath = path.join(dir, "fnb-statement.pdf");
  await createSyntheticPdf(filePath, [
    "FNB BANK STATEMENT",
    "Account: ****1234",
    "Period: 2026-01-01 to 2026-01-31",
    "Opening Balance: 1000.00",
    "Closing Balance: 1250.00",
    "Transactions:",
    "2026-01-05 | Grocery Store | -250.00 | 750.00 | CARD123",
    "2026-01-10 | Salary | 500.00 | 1250.00 | EFT456",
  ]);

  const result = await parseFnbStatement({ filePath });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.metadata.parser, "@awesome-za/fnb");
  assert.equal(result.metadata.checks.every((check) => check.status === "passed"), true);
  assert.deepEqual(result.data, {
    institution: "FNB",
    accountNumberMasked: "****1234",
    period: { from: "2026-01-01", to: "2026-01-31" },
    openingBalance: 1000,
    closingBalance: 1250,
    transactions: [
      {
        date: "2026-01-05",
        description: "Grocery Store",
        amount: -250,
        currency: "ZAR",
        balance: 750,
        reference: "CARD123",
      },
      {
        date: "2026-01-10",
        description: "Salary",
        amount: 500,
        currency: "ZAR",
        balance: 1250,
        reference: "EFT456",
      },
    ],
  });
});

test("returns a parse error for invalid FNB PDF input", async () => {
  const dir = await createTempDir("za-toolbox-fnb-invalid-");
  const filePath = path.join(dir, "not-a-real.pdf");
  await writeFile(filePath, "not a pdf");

  const result = await parseFnbStatement({ filePath });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "INVALID_PDF");
});
