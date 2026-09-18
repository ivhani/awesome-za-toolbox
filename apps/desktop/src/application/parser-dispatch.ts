import type { ParseResult } from "@awesome-za/core";
import type { BankStatement, MunicipalStatement } from "@awesome-za/schemas";
import type {
  Diagnostic,
  DocumentKind,
  NormalizedDocument,
  ParserCandidate,
  ResultCheck,
  TerminalDocumentStatus,
} from "../shared/contract.js";

type SupportedDocument = BankStatement | MunicipalStatement;

export interface ParserAdapter {
  kind: DocumentKind;
  parse(filePath: string): Promise<ParseResult<SupportedDocument>>;
}

export interface DispatchResult {
  status: Extract<TerminalDocumentStatus, "success" | "review" | "failed">;
  normalized?: NormalizedDocument;
  warnings: Diagnostic[];
  errors: Diagnostic[];
  checks: ResultCheck[];
  candidates: ParserCandidate[];
}

export const defaultParserAdapters: ParserAdapter[] = [
  {
    kind: "bank-statement",
    parse: async (filePath) => {
      const { parseFnbStatement } = await import("@awesome-za/fnb");
      return parseFnbStatement({ filePath });
    },
  },
  {
    kind: "municipal-statement",
    parse: async (filePath) => {
      const { parseEjoburgStatement } = await import("@awesome-za/ejoburg");
      return parseEjoburgStatement({ filePath });
    },
  },
];

export async function dispatchDocument(
  filePath: string,
  adapters: ParserAdapter[] = defaultParserAdapters,
): Promise<DispatchResult> {
  const attempts = await Promise.all(adapters.map(async (adapter) => ({
    adapter,
    result: await safelyParse(adapter, filePath),
  })));

  const candidates = attempts.map(({ adapter, result }): ParserCandidate => ({
    kind: adapter.kind,
    parser: result.metadata.parser,
    confidence: result.metadata.confidence,
    ok: result.ok,
    warnings: result.warnings,
    errors: result.errors,
  }));
  const successes = attempts.filter(({ result }) => result.ok && result.data);

  if (successes.length === 0) {
    return {
      status: "failed",
      warnings: [],
      errors: attempts.flatMap(({ adapter, result }) => result.errors.length > 0
        ? result.errors
        : [{ code: "PARSER_REJECTED", message: `${adapter.kind} parser did not recognize this document.` }]),
      checks: [],
      candidates,
    };
  }

  if (successes.length > 1) {
    return {
      status: "review",
      warnings: [{
        code: "AMBIGUOUS_DOCUMENT",
        message: "More than one parser recognized this PDF. Review the parser candidates before exporting.",
      }],
      errors: [],
      checks: successes.flatMap(({ result }) => result.metadata.checks),
      candidates,
    };
  }

  const selected = successes[0];
  if (!selected?.result.data) {
    throw new Error("Parser dispatch reached an invalid success state.");
  }

  const normalized = selected.adapter.kind === "bank-statement"
    ? { kind: "bank-statement" as const, value: selected.result.data as BankStatement }
    : { kind: "municipal-statement" as const, value: selected.result.data as MunicipalStatement };
  const needsReview = selected.result.metadata.confidence !== "high"
    || selected.result.warnings.length > 0
    || selected.result.metadata.checks.some((check) => check.status === "failed");

  return {
    status: needsReview ? "review" : "success",
    normalized,
    warnings: selected.result.warnings,
    errors: [],
    checks: selected.result.metadata.checks,
    candidates,
  };
}

async function safelyParse(adapter: ParserAdapter, filePath: string): Promise<ParseResult<SupportedDocument>> {
  try {
    return await adapter.parse(filePath);
  } catch {
    return {
      ok: false,
      errors: [{ code: "UNEXPECTED_PARSER_FAILURE", message: `${adapter.kind} parser stopped unexpectedly.` }],
      warnings: [],
      metadata: {
        parser: adapter.kind,
        parserVersion: "unknown",
        sourceFileName: "",
        confidence: "low",
        checks: [],
      },
    };
  }
}
