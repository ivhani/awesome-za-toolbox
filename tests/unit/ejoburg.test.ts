import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { parseEjoburgStatement } from "@awesome-za/ejoburg";
import { createSyntheticPdf, createTempDir } from "../helpers/synthetic-pdf.ts";

test("parses a synthetic eJoburg statement PDF", async () => {
  const dir = await createTempDir("za-toolbox-ejoburg-");
  const filePath = path.join(dir, "ejoburg-statement.pdf");
  await createSyntheticPdf(filePath, [
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

  const result = await parseEjoburgStatement({ filePath });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.metadata.parser, "@awesome-za/ejoburg");
  assert.equal(result.metadata.checks[0]?.status, "passed");
  assert.deepEqual(result.data, {
    municipality: "City of Johannesburg",
    accountNumber: "123456789",
    billingPeriod: { from: "2026-01-01", to: "2026-01-31" },
    openingBalance: 500,
    closingBalance: 750,
    charges: [
      {
        date: "2026-01-03",
        description: "Electricity",
        amount: 300,
        currency: "ZAR",
        reference: "ELEC",
      },
      {
        date: "2026-01-04",
        description: "Water",
        amount: 100,
        currency: "ZAR",
        reference: "WATER",
      },
    ],
    payments: [
      {
        date: "2026-01-20",
        description: "Payment received",
        amount: -150,
        currency: "ZAR",
        reference: "EFT",
      },
    ],
  });
});
