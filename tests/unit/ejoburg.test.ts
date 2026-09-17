import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { parseEjoburgStatement } from "@awesome-za/ejoburg";
import { extractPdfXfaDataset } from "@awesome-za/pdf-utils";
import {
  createSyntheticPdf,
  createSyntheticXfaPdf,
  createTempDir,
  syntheticCojXfaDataset,
} from "../helpers/synthetic-pdf.ts";

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

test("extracts an embedded COJ XFA dataset from a compressed PDF stream", async () => {
  const dir = await createTempDir("za-toolbox-ejoburg-xfa-extract-");
  const filePath = path.join(dir, "ejoburg-xfa.pdf");
  await createSyntheticXfaPdf(filePath, syntheticCojXfaDataset());

  const xml = await extractPdfXfaDataset(filePath);

  assert.match(xml, /<xfa:datasets/);
  assert.match(xml, /<Bill>/);
  assert.match(xml, /<AccountNumber>999000111<\/AccountNumber>/);
});

test("parses a synthetic COJ XFA dynamic-form statement PDF", async () => {
  const dir = await createTempDir("za-toolbox-ejoburg-xfa-");
  const filePath = path.join(dir, "ejoburg-xfa.pdf");
  await createSyntheticXfaPdf(filePath, syntheticCojXfaDataset());

  const result = await parseEjoburgStatement({ filePath });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.metadata.checks[0]?.status, "passed");
  assert.equal(result.data?.accountNumber, "999000111");
  assert.deepEqual(result.data?.billingPeriod, { from: "2026-01-01", to: "2026-01-31" });
  assert.equal(result.data?.openingBalance, 500);
  assert.equal(result.data?.closingBalance, 750);
  assert.deepEqual(result.data?.charges.map((item) => item.amount), [400, 250, 100]);
  assert.deepEqual(result.data?.payments.map((item) => item.amount), [-500]);
  assert.equal(result.data?.charges[0]?.description, "Water: Consumption charge");
  assert.equal(result.data?.payments[0]?.description, "Payments: Payment received");
});

test("returns reconciliation warnings for mismatched COJ XFA totals", async () => {
  const dir = await createTempDir("za-toolbox-ejoburg-xfa-recon-");
  const filePath = path.join(dir, "ejoburg-xfa-recon.pdf");
  await createSyntheticXfaPdf(filePath, syntheticCojXfaDataset({ totalDue: "751.00" }));

  const result = await parseEjoburgStatement({ filePath });

  assert.equal(result.ok, true);
  assert.equal(result.metadata.checks[0]?.status, "failed");
  assert.equal(result.warnings.at(-1)?.code, "EJOBURG_RECONCILIATION_FAILED");
});

test("returns a structured failure for unsupported COJ XFA datasets", async () => {
  const dir = await createTempDir("za-toolbox-ejoburg-xfa-bad-");
  const filePath = path.join(dir, "ejoburg-xfa-bad.pdf");
  await createSyntheticXfaPdf(filePath, [
    "<xfa:datasets xmlns:xfa=\"http://www.xfa.org/schema/xfa-data/1.0/\">",
    "<xfa:data><UnsupportedStatement /></xfa:data>",
    "</xfa:datasets>",
  ].join(""));

  const result = await parseEjoburgStatement({ filePath });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "EJOBURG_XFA_BILL_NOT_FOUND");
});
