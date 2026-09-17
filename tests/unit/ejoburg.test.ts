import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { createMetadata, type ParseResult } from "@awesome-za/core";
import {
  consolidateEjoburgStrategyResults,
  parseEjoburgStatement,
  runEjoburgParseStrategies,
  type EjoburgStrategyResult,
} from "@awesome-za/ejoburg";
import { extractPdfLayoutText, extractPdfXfaDataset } from "@awesome-za/pdf-utils";
import type { MunicipalStatement } from "@awesome-za/schemas";
import {
  createSyntheticPdf,
  createSyntheticPositionedPdf,
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
  assert.equal(consolidationStatus(result), "single-success");
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

test("runs standard text, XFA, and layout-aware strategies independently for standard PDFs", async () => {
  const dir = await createTempDir("za-toolbox-ejoburg-strategies-standard-");
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

  const results = await runEjoburgParseStrategies({ filePath });

  assert.deepEqual(results.map((result) => result.strategy), ["standard-text", "xfa-dataset", "layout-aware"]);
  assert.equal(results.find((result) => result.strategy === "standard-text")?.ok, true);
  assert.equal(results.find((result) => result.strategy === "xfa-dataset")?.ok, false);
  assert.equal(results.find((result) => result.strategy === "layout-aware")?.ok, false);
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
  assert.equal(consolidationStatus(result), "single-success");
  assert.equal(result.data?.accountNumber, "999000111");
  assert.deepEqual(result.data?.billingPeriod, { from: "2026-01-01", to: "2026-01-31" });
  assert.equal(result.data?.openingBalance, 500);
  assert.equal(result.data?.closingBalance, 750);
  assert.deepEqual(result.data?.charges.map((item) => item.amount), [400, 250, 100]);
  assert.deepEqual(result.data?.payments.map((item) => item.amount), [-500]);
  assert.equal(result.data?.charges[0]?.description, "Water: Consumption charge");
  assert.equal(result.data?.payments[0]?.description, "Payments: Payment received");
});

test("runs XFA as an independent peer strategy", async () => {
  const dir = await createTempDir("za-toolbox-ejoburg-strategies-xfa-");
  const filePath = path.join(dir, "ejoburg-xfa.pdf");
  await createSyntheticXfaPdf(filePath, syntheticCojXfaDataset());

  const results = await runEjoburgParseStrategies({ filePath });

  assert.equal(results.find((result) => result.strategy === "standard-text")?.ok, false);
  assert.equal(results.find((result) => result.strategy === "xfa-dataset")?.ok, true);
  assert.equal(results.find((result) => result.strategy === "layout-aware")?.ok, false);
});

test("extracts and parses positioned COJ tax-invoice text with the layout-aware strategy", async () => {
  const dir = await createTempDir("za-toolbox-ejoburg-layout-");
  const filePath = path.join(dir, "coj-layout.pdf");
  await createSyntheticPositionedPdf(filePath, syntheticCojLayoutItems());

  const layout = await extractPdfLayoutText(filePath);
  assert.equal(layout.pages, 1);
  assert.ok(layout.items.length > 10);

  const results = await runEjoburgParseStrategies({ filePath });
  const layoutResult = results.find((result) => result.strategy === "layout-aware");

  assert.equal(layoutResult?.ok, true);
  assert.equal(layoutResult?.statement?.accountNumber, "558000000");
  assert.deepEqual(layoutResult?.statement?.billingPeriod, { from: "2026-06-01", to: "2026-06-30" });
  assert.equal(layoutResult?.statement?.openingBalance, -1303.11);
  assert.equal(layoutResult?.statement?.closingBalance, -499.22);
  assert.equal(layoutResult?.statement?.charges.length, 3);

  const result = await parseEjoburgStatement({ filePath });
  assert.equal(result.ok, true);
  assert.equal(consolidationStatus(result), "single-success");
  assert.equal(result.data?.charges.reduce((sum, item) => Math.round((sum + item.amount) * 100) / 100, 0), 803.89);
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
  assert.equal(result.errors[0]?.code, "EJOBURG_ALL_STRATEGIES_FAILED");
  assert.equal(consolidationStatus(result), "all-failed");
});

test("consolidates materially agreeing strategy results", () => {
  const result = consolidateEjoburgStrategyResults([
    successfulStrategy("standard-text", sampleMunicipalStatement()),
    successfulStrategy("layout-aware", sampleMunicipalStatement()),
    failedStrategy("xfa-dataset", "PDF_XFA_DATASET_NOT_FOUND"),
  ], testMetadata());

  assert.equal(result.ok, true);
  assert.equal(consolidationStatus(result), "agreed");
  assert.equal(result.data?.accountNumber, "123456789");
});

test("consolidates a single successful strategy while preserving failed peer diagnostics", () => {
  const result = consolidateEjoburgStrategyResults([
    failedStrategy("standard-text", "PARSE_FAILED"),
    successfulStrategy("xfa-dataset", sampleMunicipalStatement()),
    failedStrategy("layout-aware", "EJOBURG_LAYOUT_UNSUPPORTED"),
  ], testMetadata());

  assert.equal(result.ok, true);
  assert.equal(consolidationStatus(result), "single-success");
  assert.equal(result.warnings.filter((warning) => warning.code === "EJOBURG_STRATEGY_FAILED").length, 2);
});

test("requires review instead of choosing a winner when successful strategies disagree", () => {
  const changed = sampleMunicipalStatement();
  changed.closingBalance = 999;

  const result = consolidateEjoburgStrategyResults([
    successfulStrategy("standard-text", sampleMunicipalStatement()),
    successfulStrategy("layout-aware", changed),
  ], testMetadata());

  assert.equal(result.ok, false);
  assert.equal(result.data, undefined);
  assert.equal(result.errors[0]?.code, "EJOBURG_STRATEGY_DISAGREEMENT");
  assert.equal(consolidationStatus(result), "review-required");
});

test("reports all-failed consolidation when no strategy succeeds", () => {
  const result = consolidateEjoburgStrategyResults([
    failedStrategy("standard-text", "PARSE_FAILED"),
    failedStrategy("xfa-dataset", "PDF_XFA_DATASET_NOT_FOUND"),
    failedStrategy("layout-aware", "EJOBURG_LAYOUT_UNSUPPORTED"),
  ], testMetadata());

  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "EJOBURG_ALL_STRATEGIES_FAILED");
  assert.equal(consolidationStatus(result), "all-failed");
});

function syntheticCojLayoutItems(): { text: string; x: number; y: number; size?: number }[] {
  return [
    row(50, 750, "CITY OF JOHANNESBURG"),
    row(50, 734, "TAX INVOICE"),
    row(50, 718, "Account Number"),
    row(220, 718, "558000000"),
    row(50, 702, "Statement for June 2026"),
    row(50, 686, "Previous Account Balance"),
    row(210, 686, "Current Charges (Excl. VAT)"),
    row(390, 686, "VAT @ 15%"),
    row(480, 686, "Total Due"),
    row(50, 670, "-1,303.11"),
    row(210, 670, "773.89"),
    row(390, 670, "30.00"),
    row(480, 670, "-499.22"),
    row(50, 638, "Water and Sanitation VAT 1234567890 Sub - Total Total"),
    row(50, 622, "Basic charge (Billing Period 2026/06)"),
    row(430, 622, "200.00"),
    row(50, 606, "VAT: 15%"),
    row(430, 606, "30.00"),
    row(50, 574, "PIKITUP"),
    row(50, 558, "Refuse charge"),
    row(430, 558, "573.89"),
  ];
}

function row(x: number, y: number, text: string): { text: string; x: number; y: number; size?: number } {
  return { x, y, text };
}

function testMetadata(): ReturnType<typeof createMetadata> {
  return createMetadata({
    parser: "@awesome-za/ejoburg",
    parserVersion: "test",
    sourceFileName: "test.pdf",
  });
}

function sampleMunicipalStatement(): MunicipalStatement {
  return {
    municipality: "City of Johannesburg",
    accountNumber: "123456789",
    billingPeriod: { from: "2026-01-01", to: "2026-01-31" },
    openingBalance: 500,
    closingBalance: 750,
    charges: [
      { date: "2026-01-03", description: "Electricity", amount: 300, currency: "ZAR" },
      { date: "2026-01-04", description: "Water", amount: 100, currency: "ZAR" },
    ],
    payments: [
      { date: "2026-01-20", description: "Payment received", amount: -150, currency: "ZAR" },
    ],
  };
}

function successfulStrategy(strategy: EjoburgStrategyResult["strategy"], statement: MunicipalStatement): EjoburgStrategyResult {
  return {
    strategy,
    ok: true,
    statement,
    warnings: [],
    errors: [],
    provenance: strategy === "xfa-dataset" ? { extraction: "xfa-dataset" } : { extraction: strategy === "layout-aware" ? "layout-text" : "pdf-text" },
  };
}

function failedStrategy(strategy: EjoburgStrategyResult["strategy"], code: string): EjoburgStrategyResult {
  return {
    strategy,
    ok: false,
    warnings: [],
    errors: [{ code, message: code }],
    provenance: strategy === "xfa-dataset" ? { extraction: "xfa-dataset" } : { extraction: strategy === "layout-aware" ? "layout-text" : "pdf-text" },
  };
}

function consolidationStatus(result: ParseResult<MunicipalStatement>): string | undefined {
  return (result.metadata as typeof result.metadata & { consolidation?: { status: string } }).consolidation?.status;
}
