import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

export type ParseConfidence = "high" | "medium" | "low";
export type CheckStatus = "passed" | "failed" | "skipped";

export interface ParseCheck {
  name: string;
  status: CheckStatus;
  message?: string;
}

export interface ParseMetadata {
  parser: string;
  parserVersion: string;
  sourceFileName: string;
  confidence: ParseConfidence;
  checks: ParseCheck[];
}

export interface ParseError {
  code: string;
  message: string;
}

export interface ParseWarning {
  code: string;
  message: string;
}

export interface ParseResult<T> {
  ok: boolean;
  data?: T;
  errors: ParseError[];
  warnings: ParseWarning[];
  metadata: ParseMetadata;
}

export interface ParseInput {
  filePath: string;
}

export class ToolboxError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolboxError";
  }
}

export function sourceFileName(filePath: string): string {
  return path.basename(filePath);
}

export async function assertReadableFile(filePath: string): Promise<void> {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new ToolboxError("FILE_NOT_READABLE", `File is missing or not readable: ${filePath}`);
  }
}

export function createMetadata(input: {
  parser: string;
  parserVersion: string;
  sourceFileName: string;
  confidence?: ParseConfidence;
  checks?: ParseCheck[];
}): ParseMetadata {
  return {
    parser: input.parser,
    parserVersion: input.parserVersion,
    sourceFileName: input.sourceFileName,
    confidence: input.confidence ?? "low",
    checks: input.checks ?? [],
  };
}

export function okResult<T>(input: {
  data: T;
  metadata: ParseMetadata;
  warnings?: ParseWarning[];
}): ParseResult<T> {
  return {
    ok: true,
    data: input.data,
    errors: [],
    warnings: input.warnings ?? [],
    metadata: input.metadata,
  };
}

export function errorResult<T>(input: {
  metadata: ParseMetadata;
  errors: ParseError[];
  warnings?: ParseWarning[];
}): ParseResult<T> {
  return {
    ok: false,
    errors: input.errors,
    warnings: input.warnings ?? [],
    metadata: input.metadata,
  };
}

export function unknownError(error: unknown): ParseError {
  if (error instanceof ToolboxError) {
    return { code: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return { code: "PARSE_FAILED", message: error.message };
  }

  return { code: "PARSE_FAILED", message: "Unknown parse failure." };
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function amountsEqual(left: number, right: number): boolean {
  return Math.abs(roundMoney(left) - roundMoney(right)) < 0.01;
}
