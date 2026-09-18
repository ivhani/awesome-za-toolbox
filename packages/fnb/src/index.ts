import {
  createMetadata,
  errorResult,
  okResult,
  sourceFileName,
  ToolboxError,
  unknownError,
  type ParseInput,
  type ParseResult,
} from "@awesome-za/core";
import { extractPdfText } from "@awesome-za/pdf-utils";
import type { BankStatement } from "@awesome-za/schemas";
import {
  detectFnbStatementFamily,
  type FnbFamilyDetection,
} from "./detection.js";
import {
  FNB_STRATEGY_ORDER,
  fnbStatementDifferenceFields,
  fnbStatementsMateriallyAgree,
  runFnbStrategiesForText,
  type FnbStrategyResult,
} from "./strategies.js";

export {
  detectFnbStatementFamily,
  FNB_STATEMENT_FAMILIES,
  type FnbDetectionEvidence,
  type FnbFamilyCandidate,
  type FnbFamilyDetection,
  type FnbStatementFamily,
} from "./detection.js";
export {
  FNB_STRATEGY_ORDER,
  runFnbStrategiesForText,
  type FnbStrategyName,
  type FnbStrategyProvenance,
  type FnbStrategyResult,
} from "./strategies.js";

const PARSER_NAME = "@awesome-za/fnb";
const PARSER_VERSION = "0.2.0";

interface FnbStrategyDiagnostic {
  strategy: FnbStrategyResult["strategy"];
  family: FnbStrategyResult["family"];
  version: string;
  applicable: boolean;
  ok: boolean;
  warningCodes: string[];
  errors: FnbStrategyResult["errors"];
  checks: FnbStrategyResult["checks"];
  provenance: FnbStrategyResult["provenance"];
}

interface FnbConsolidationMetadata {
  status: "not-run" | "single-success" | "agreed" | "all-failed" | "review-required" | "unsupported-layout";
  selectedStrategy?: FnbStrategyResult["strategy"];
  reviewRequired: boolean;
  successfulStrategies: FnbStrategyResult["strategy"][];
  disagreementFields?: string[];
}

type FnbParseMetadata = ReturnType<typeof createMetadata> & {
  familyDetection: FnbFamilyDetection;
  strategies: FnbStrategyDiagnostic[];
  consolidation: FnbConsolidationMetadata;
};

export async function parse(input: ParseInput): Promise<ParseResult<BankStatement>> {
  return parseFnbStatement(input);
}

export async function parseFnbStatement(input: ParseInput): Promise<ParseResult<BankStatement>> {
  const baseMetadata = parserMetadata(sourceFileName(input.filePath));

  try {
    const extracted = await extractPdfText(input.filePath);
    return parseExtractedText({
      text: extracted.text,
      pages: extracted.pages,
      extraction: "pdf-text",
      baseMetadata,
    });
  } catch (error) {
    return errorResult({
      metadata: baseMetadata,
      errors: [unknownError(error)],
    });
  }
}

export function parseFnbStatementTextResult(
  text: string,
  sourceName = "provided-text",
): ParseResult<BankStatement> {
  return parseExtractedText({
    text,
    extraction: "provided-text",
    baseMetadata: parserMetadata(sourceName),
  });
}

export function parseFnbStatementText(text: string): {
  statement: BankStatement;
  warnings: ParseResult<BankStatement>["warnings"];
} {
  const result = parseFnbStatementTextResult(text);
  if (!result.ok || !result.data) {
    const error = result.errors[0] ?? { code: "FNB_PARSE_FAILED", message: "The FNB statement could not be parsed." };
    throw new ToolboxError(error.code, error.message);
  }

  return { statement: result.data, warnings: result.warnings };
}

export function consolidateFnbStrategyResults(
  strategyResults: FnbStrategyResult[],
  detection: FnbFamilyDetection,
  baseMetadata: ReturnType<typeof createMetadata> = parserMetadata("provided-text"),
): ParseResult<BankStatement> {
  const metadataBase = {
    ...baseMetadata,
    familyDetection: detection,
    strategies: strategyResults.map(toStrategyDiagnostic),
  };

  if (detection.status !== "detected" || !detection.family) {
    const metadata: FnbParseMetadata = {
      ...metadataBase,
      confidence: "low",
      checks: [],
      consolidation: {
        status: "not-run",
        reviewRequired: true,
        successfulStrategies: [],
      },
    };

    return errorResult({
      metadata,
      errors: [{
        code: detection.status === "ambiguous" ? "FNB_FAMILY_AMBIGUOUS" : "FNB_FAMILY_UNDETECTED",
        message: detection.status === "ambiguous"
          ? "The statement contains evidence for multiple FNB statement families; manual review is required."
          : "The FNB statement family could not be identified from supported evidence.",
      }],
    });
  }

  const successful = strategyResults.filter(
    (result): result is FnbStrategyResult & { statement: BankStatement } => result.ok && result.statement !== undefined,
  );

  if (successful.length === 0) {
    const hasApplicableStrategy = strategyResults.some((result) => result.applicable);
    const metadata: FnbParseMetadata = {
      ...metadataBase,
      confidence: "low",
      checks: strategyResults.find((result) => result.applicable)?.checks ?? [],
      consolidation: {
        status: hasApplicableStrategy ? "all-failed" : "unsupported-layout",
        reviewRequired: true,
        successfulStrategies: [],
      },
    };

    return errorResult({
      metadata,
      errors: [{
        code: hasApplicableStrategy ? "FNB_ALL_STRATEGIES_FAILED" : "FNB_LAYOUT_UNSUPPORTED",
        message: hasApplicableStrategy
          ? "Every applicable strategy failed semantic or reconciliation validation."
          : `No extraction strategy supports the detected ${detection.family} layout.`,
      }],
    });
  }

  const orderedSuccessful = [...successful].sort(
    (left, right) => FNB_STRATEGY_ORDER.indexOf(left.strategy) - FNB_STRATEGY_ORDER.indexOf(right.strategy),
  );
  const selected = orderedSuccessful[0];
  if (!selected) {
    throw new Error("FNB strategy consolidation invariant failed.");
  }

  if (orderedSuccessful.some((result) => !fnbStatementsMateriallyAgree(selected.statement, result.statement))) {
    const disagreementFields = [...new Set(orderedSuccessful.flatMap(
      (result) => fnbStatementDifferenceFields(selected.statement, result.statement),
    ))];
    const metadata: FnbParseMetadata = {
      ...metadataBase,
      confidence: "low",
      checks: [],
      consolidation: {
        status: "review-required",
        reviewRequired: true,
        successfulStrategies: orderedSuccessful.map((result) => result.strategy),
        disagreementFields,
      },
    };

    return errorResult({
      metadata,
      errors: [{
        code: "FNB_STRATEGY_DISAGREEMENT",
        message: "Successful FNB strategies produced materially different statements; manual review is required.",
      }],
    });
  }

  const reviewRequired = selected.warnings.length > 0;
  const metadata: FnbParseMetadata = {
    ...metadataBase,
    confidence: reviewRequired ? "medium" : "high",
    checks: selected.checks,
    consolidation: {
      status: orderedSuccessful.length === 1 ? "single-success" : "agreed",
      selectedStrategy: selected.strategy,
      reviewRequired,
      successfulStrategies: orderedSuccessful.map((result) => result.strategy),
    },
  };

  return okResult({
    data: selected.statement,
    warnings: selected.warnings,
    metadata,
  });
}

function parseExtractedText(input: {
  text: string;
  pages?: number;
  extraction: "pdf-text" | "provided-text";
  baseMetadata: ReturnType<typeof createMetadata>;
}): ParseResult<BankStatement> {
  const detection = detectFnbStatementFamily(input.text);
  const strategyResults = detection.status === "detected" && detection.family
    ? runFnbStrategiesForText({
      text: input.text,
      family: detection.family,
      extraction: input.extraction,
      pages: input.pages,
    })
    : [];

  return consolidateFnbStrategyResults(strategyResults, detection, input.baseMetadata);
}

function parserMetadata(name: string): ReturnType<typeof createMetadata> {
  return createMetadata({
    parser: PARSER_NAME,
    parserVersion: PARSER_VERSION,
    sourceFileName: name,
  });
}

function toStrategyDiagnostic(result: FnbStrategyResult): FnbStrategyDiagnostic {
  return {
    strategy: result.strategy,
    family: result.family,
    version: result.version,
    applicable: result.applicable,
    ok: result.ok,
    warningCodes: [...new Set(result.warnings.map((warning) => warning.code))],
    errors: result.errors,
    checks: result.checks,
    provenance: result.provenance,
  };
}
