// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ParseResult } from "@awesome-za/core";
import type { BankStatement, MunicipalStatement } from "@awesome-za/schemas";
import { dispatchDocument, type ParserAdapter } from "../src/application/parser-dispatch.js";

const bank: BankStatement = {
  institution: "Synthetic Bank",
  accountNumberMasked: "****1234",
  period: { from: "2026-01-01", to: "2026-01-31" },
  openingBalance: 100,
  closingBalance: 125,
  transactions: [{ date: "2026-01-02", description: "Synthetic deposit", amount: 25, currency: "ZAR", balance: 125 }],
};

const municipal: MunicipalStatement = {
  municipality: "Synthetic Municipality",
  billingPeriod: { from: "2026-01-01", to: "2026-01-31" },
  charges: [{ date: "2026-01-31", description: "Synthetic service", amount: 50, currency: "ZAR" }],
  payments: [],
};

describe("dispatchDocument", () => {
  it("returns a clean success when one high-confidence parser succeeds", async () => {
    const result = await dispatchDocument("synthetic.pdf", [
      adapter("bank-statement", success(bank)),
      adapter("municipal-statement", failure("NOT_EJOBURG")),
    ]);

    expect(result.status).toBe("success");
    expect(result.normalized?.kind).toBe("bank-statement");
    expect(result.candidates).toHaveLength(2);
  });

  it("marks usable warning-bearing output for review", async () => {
    const result = await dispatchDocument("synthetic.pdf", [
      adapter("bank-statement", success(bank, { warnings: [{ code: "CHECK", message: "Review balance." }] })),
    ]);
    expect(result.status).toBe("review");
    expect(result.normalized).toBeDefined();
  });

  it("does not silently choose when multiple document kinds parse", async () => {
    const result = await dispatchDocument("synthetic.pdf", [
      adapter("bank-statement", success(bank)),
      adapter("municipal-statement", success(municipal)),
    ]);
    expect(result.status).toBe("review");
    expect(result.normalized).toBeUndefined();
    expect(result.warnings[0]?.code).toBe("AMBIGUOUS_DOCUMENT");
  });

  it("continues when a parser throws unexpectedly", async () => {
    const result = await dispatchDocument("synthetic.pdf", [
      { kind: "bank-statement", parse: async () => { throw new Error("private failure"); } },
      adapter("municipal-statement", success(municipal)),
    ]);
    expect(result.status).toBe("success");
    expect(result.candidates[0]?.errors[0]?.message).not.toContain("private failure");
  });
});

function adapter(kind: ParserAdapter["kind"], result: ParseResult<BankStatement | MunicipalStatement>): ParserAdapter {
  return { kind, parse: async () => result };
}

function success(
  data: BankStatement | MunicipalStatement,
  overrides: Partial<ParseResult<BankStatement | MunicipalStatement>> = {},
): ParseResult<BankStatement | MunicipalStatement> {
  return {
    ok: true,
    data,
    warnings: [],
    errors: [],
    metadata: { parser: "synthetic", parserVersion: "1", sourceFileName: "synthetic.pdf", confidence: "high", checks: [] },
    ...overrides,
  };
}

function failure(code: string): ParseResult<BankStatement | MunicipalStatement> {
  return {
    ok: false,
    warnings: [],
    errors: [{ code, message: "Not recognized." }],
    metadata: { parser: "synthetic", parserVersion: "1", sourceFileName: "synthetic.pdf", confidence: "low", checks: [] },
  };
}
