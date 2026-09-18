import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  countStatuses,
  type Diagnostic,
  type FileResult,
  type FolderProcessResult,
  type ProcessProgress,
} from "../shared/contract.js";
import { dispatchDocument, type DispatchResult, type ParserAdapter } from "./parser-dispatch.js";

export interface FolderProcessorOptions {
  parsers?: ParserAdapter[];
  now?: () => Date;
  createSessionId?: () => string;
}

export class FolderProcessor {
  private readonly parsers?: ParserAdapter[];
  private readonly now: () => Date;
  private readonly createSessionId: () => string;

  constructor(options: FolderProcessorOptions = {}) {
    this.parsers = options.parsers;
    this.now = options.now ?? (() => new Date());
    this.createSessionId = options.createSessionId ?? (() => crypto.randomUUID());
  }

  async process(
    input: { requestId: string; directoryPath: string; displayName: string },
    onProgress: (progress: ProcessProgress) => void,
  ): Promise<FolderProcessResult> {
    const entries = (await readdir(input.directoryPath, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));
    const results = entries.map((entry, index): FileResult => ({
      id: `file-${String(index + 1).padStart(4, "0")}`,
      fileName: entry.name,
      extension: path.extname(entry.name).toLowerCase(),
      status: "pending",
      warnings: [],
      errors: [],
      checks: [],
      candidates: [],
    }));

    this.emit(input, results, 0, undefined, onProgress);

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const entry = entries[index];
      if (!result || !entry) continue;

      result.status = "processing";
      this.emit(input, results, index, result.fileName, onProgress);

      if (result.extension !== ".pdf") {
        result.status = "unsupported";
        result.warnings = [{ code: "UNSUPPORTED_FILE_TYPE", message: "Only PDF documents are supported in this release." }];
      } else {
        const filePath = path.join(input.directoryPath, entry.name);
        try {
          const parsed = await dispatchDocument(filePath, this.parsers);
          applyDispatchResult(result, parsed, input.directoryPath);
        } catch {
          result.status = "failed";
          result.errors = [{ code: "DOCUMENT_PROCESSING_FAILED", message: "This document could not be processed." }];
        }
      }

      this.emit(input, results, index + 1, index + 1 < results.length ? results[index + 1]?.fileName : undefined, onProgress);
    }

    return {
      sessionId: this.createSessionId(),
      displayName: input.displayName,
      processedAt: this.now().toISOString(),
      counts: countStatuses(results),
      results: cloneResults(results),
    };
  }

  private emit(
    input: { requestId: string; displayName: string },
    results: FileResult[],
    completed: number,
    currentFileName: string | undefined,
    onProgress: (progress: ProcessProgress) => void,
  ): void {
    onProgress({
      requestId: input.requestId,
      displayName: input.displayName,
      completed,
      total: results.length,
      currentFileName,
      counts: countStatuses(results),
      results: cloneResults(results),
    });
  }
}

function applyDispatchResult(result: FileResult, parsed: DispatchResult, directoryPath: string): void {
  result.status = parsed.status;
  result.normalized = parsed.normalized;
  result.warnings = sanitizeDiagnostics(parsed.warnings, directoryPath);
  result.errors = sanitizeDiagnostics(parsed.errors, directoryPath);
  result.checks = parsed.checks.map((check) => ({
    ...check,
    message: check.message ? sanitizeMessage(check.message, directoryPath) : undefined,
  }));
  result.candidates = parsed.candidates.map((candidate) => ({
    ...candidate,
    warnings: sanitizeDiagnostics(candidate.warnings, directoryPath),
    errors: sanitizeDiagnostics(candidate.errors, directoryPath),
  }));
}

function sanitizeDiagnostics(diagnostics: Diagnostic[], directoryPath: string): Diagnostic[] {
  return diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: sanitizeMessage(diagnostic.message, directoryPath),
  }));
}

function sanitizeMessage(message: string, directoryPath: string): string {
  const escapedDirectory = directoryPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return message
    .replace(new RegExp(escapedDirectory, "gi"), "<selected-folder>")
    .replace(/[A-Za-z]:\\[^\n\r]*/g, "<local-path>");
}

function cloneResults(results: FileResult[]): FileResult[] {
  return structuredClone(results);
}
