import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  consolidateFnbStrategyResults,
  detectFnbStatementFamily,
  parseFnbStatement,
  parseFnbStatementTextResult,
  type FnbStatementFamily,
  type FnbStrategyResult,
} from "@awesome-za/fnb";
import type { ParseResult } from "@awesome-za/core";
import type { BankStatement } from "@awesome-za/schemas";
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
  assert.equal(fnbMetadata(result).familyDetection.family, "personal-current-account");
  assert.equal(fnbMetadata(result).consolidation.selectedStrategy, "personal-current-pipe-v1");
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

test("detects supported and known FNB statement families from explicit evidence", () => {
  const cases: [FnbStatementFamily, string][] = [
    ["personal-current-account", "FNB Fusion Premier Account : 00000000000"],
    ["business-account", "FIRST BUSINESS ZERO ACCOUNT"],
    ["home-loan", "Home Loan Transaction History from 01 January 2026 to 31 January 2026"],
    ["credit-card", "FNB Gold Credit Card"],
  ];

  for (const [expectedFamily, text] of cases) {
    const detection = detectFnbStatementFamily(text);
    assert.equal(detection.status, "detected");
    assert.equal(detection.family, expectedFamily);
    assert.equal(detection.candidates.find((candidate) => candidate.family === expectedFamily)?.evidence.length! > 0, true);
  }
});

test("requires review when family evidence is ambiguous before extraction", () => {
  const result = parseFnbStatementTextResult([
    "FNB Fusion Premier Account : 00000000000",
    "Home Loan Transaction History from 01 January 2026 to 31 January 2026",
  ].join("\n"));

  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "FNB_FAMILY_AMBIGUOUS");
  assert.equal(fnbMetadata(result).familyDetection.status, "ambiguous");
  assert.equal(fnbMetadata(result).strategies.length, 0);
  assert.equal(fnbMetadata(result).consolidation.reviewRequired, true);
});

test("returns an undetected-family failure instead of trying every parser", () => {
  const result = parseFnbStatementTextResult("Unrelated document text with no FNB family evidence.");

  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "FNB_FAMILY_UNDETECTED");
  assert.equal(fnbMetadata(result).familyDetection.status, "undetected");
  assert.equal(fnbMetadata(result).strategies.length, 0);
});

test("reports detected credit-card statements as unsupported pending representative evidence", () => {
  const result = parseFnbStatementTextResult([
    "FNB Gold Credit Card",
    "Statement Period: 01 Jan 2026 to 31 Jan 2026",
  ].join("\n"));

  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "FNB_LAYOUT_UNSUPPORTED");
  assert.equal(fnbMetadata(result).familyDetection.family, "credit-card");
  assert.equal(fnbMetadata(result).consolidation.status, "unsupported-layout");
});

test("fails an applicable strategy when statement balances do not reconcile", () => {
  const result = parseFnbStatementTextResult([
    "FNB BANK STATEMENT",
    "Account: ****0000",
    "Period: 2026-01-01 to 2026-01-31",
    "Opening Balance: 100.00",
    "Closing Balance: 999.00",
    "Transactions:",
    "2026-01-05 Example Purchase -10.00 90.00 REF001",
  ].join("\n"));

  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "FNB_ALL_STRATEGIES_FAILED");
  const applicable = fnbMetadata(result).strategies.find((strategy) => strategy.applicable);
  assert.equal(applicable?.errors[0]?.code, "FNB_RECONCILIATION_FAILED");
  assert.equal(applicable?.checks.find((check) => check.name === "statement-balance-reconciliation")?.status, "failed");
});

test("fails honestly when a dated row does not match the detected layout version", () => {
  const result = parseFnbStatementTextResult([
    "FNB BANK STATEMENT",
    "Account: ****0000",
    "Period: 2026-01-01 to 2026-01-31",
    "Opening Balance: 100.00",
    "Closing Balance: 90.00",
    "Transactions:",
    "2026-01-05 Example Purchase -10.00 90.00 REF001",
    "2026-01-06 unsupported dated row",
  ].join("\n"));

  assert.equal(result.ok, false);
  const applicable = fnbMetadata(result).strategies.find((strategy) => strategy.applicable);
  assert.equal(applicable?.errors[0]?.code, "FNB_TRANSACTION_ROW_UNSUPPORTED");
});

test("returns structured uncertainty instead of choosing materially disagreeing strategies", () => {
  const statement = sampleBankStatement();
  const changed: BankStatement = {
    ...statement,
    closingBalance: 140,
    transactions: [{ ...statement.transactions[0]!, amount: 40, balance: 140 }],
  };
  const detection = detectFnbStatementFamily("FNB BANK STATEMENT\nPeriod: 2026-01-01 to 2026-01-31\nTransactions:");
  const result = consolidateFnbStrategyResults([
    successfulStrategy("personal-current-pipe-v1", "pipe-v1", statement),
    successfulStrategy("personal-current-standard-columns-v1", "standard-columns-v1", changed),
  ], detection);

  assert.equal(result.ok, false);
  assert.equal(result.errors[0]?.code, "FNB_STRATEGY_DISAGREEMENT");
  assert.equal(fnbMetadata(result).consolidation.status, "review-required");
  assert.deepEqual(fnbMetadata(result).consolidation.disagreementFields, ["closing-balance", "transactions"]);
  assert.equal(fnbMetadata(result).strategies.length, 2);
});

test("consolidates materially agreeing strategies while retaining both provenances", () => {
  const statement = sampleBankStatement();
  const detection = detectFnbStatementFamily("FNB BANK STATEMENT\nPeriod: 2026-01-01 to 2026-01-31\nTransactions:");
  const result = consolidateFnbStrategyResults([
    successfulStrategy("personal-current-pipe-v1", "pipe-v1", statement),
    successfulStrategy("personal-current-standard-columns-v1", "standard-columns-v1", statement),
  ], detection);

  assert.equal(result.ok, true);
  assert.equal(fnbMetadata(result).consolidation.status, "agreed");
  assert.equal(fnbMetadata(result).strategies.length, 2);
});

function sampleBankStatement(): BankStatement {
  return {
    institution: "FNB",
    accountNumberMasked: "****0000",
    period: { from: "2026-01-01", to: "2026-01-31" },
    openingBalance: 100,
    closingBalance: 110,
    transactions: [{
      date: "2026-01-05",
      description: "Synthetic transaction",
      amount: 10,
      currency: "ZAR",
      balance: 110,
    }],
  };
}

function successfulStrategy(
  strategy: FnbStrategyResult["strategy"],
  version: string,
  statement: BankStatement,
): FnbStrategyResult {
  return {
    strategy,
    family: "personal-current-account",
    version,
    applicable: true,
    ok: true,
    statement,
    warnings: [],
    errors: [],
    checks: [{ name: "statement-balance-reconciliation", status: "passed" }],
    provenance: {
      family: "personal-current-account",
      version,
      extraction: "provided-text",
      lineCount: 7,
      applicabilityEvidence: ["synthetic-test-evidence"],
    },
  };
}

function fnbMetadata(result: ParseResult<BankStatement>): {
  familyDetection: { status: string; family?: string };
  strategies: {
    applicable: boolean;
    errors: { code: string }[];
    checks: { name: string; status: string }[];
  }[];
  consolidation: { status: string; selectedStrategy?: string; reviewRequired: boolean; disagreementFields?: string[] };
} {
  return result.metadata as typeof result.metadata & ReturnType<typeof fnbMetadata>;
}
