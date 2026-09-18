import type { BankStatement, MunicipalStatement } from "@awesome-za/schemas";

export type TerminalDocumentStatus = "success" | "review" | "unsupported" | "failed";
export type DocumentStatus = "pending" | "processing" | TerminalDocumentStatus;
export type DocumentKind = "bank-statement" | "municipal-statement";
export type ExportFormat = "json" | "csv";

export interface Diagnostic {
  code: string;
  message: string;
}

export interface ResultCheck {
  name: string;
  status: "passed" | "failed" | "skipped";
  message?: string;
}

export interface ParserCandidate {
  kind: DocumentKind;
  parser: string;
  confidence: "high" | "medium" | "low";
  ok: boolean;
  warnings: Diagnostic[];
  errors: Diagnostic[];
}

export type NormalizedDocument =
  | { kind: "bank-statement"; value: BankStatement }
  | { kind: "municipal-statement"; value: MunicipalStatement };

export interface FileResult {
  id: string;
  fileName: string;
  extension: string;
  status: DocumentStatus;
  normalized?: NormalizedDocument;
  warnings: Diagnostic[];
  errors: Diagnostic[];
  checks: ResultCheck[];
  candidates: ParserCandidate[];
}

export interface StatusCounts {
  success: number;
  review: number;
  unsupported: number;
  failed: number;
}

export type FolderSelection =
  | { status: "cancelled" }
  | { status: "selected"; selectionToken: string; displayName: string };

export interface ProcessFolderRequest {
  requestId: string;
  selectionToken: string;
}

export interface ProcessProgress {
  requestId: string;
  displayName: string;
  completed: number;
  total: number;
  currentFileName?: string;
  counts: StatusCounts;
  results: FileResult[];
}

export interface FolderProcessResult {
  sessionId: string;
  displayName: string;
  processedAt: string;
  counts: StatusCounts;
  results: FileResult[];
}

export interface ExportRequest {
  sessionId: string;
  format: ExportFormat;
}

export type ExportResult =
  | { status: "cancelled" }
  | { status: "saved"; fileName: string };

export interface DesktopApplication {
  chooseFolder(): Promise<FolderSelection>;
  processFolder(
    request: ProcessFolderRequest,
    onProgress: (progress: ProcessProgress) => void,
  ): Promise<FolderProcessResult>;
  exportResults(request: ExportRequest): Promise<ExportResult>;
}

export const IPC_CHANNELS = {
  chooseFolder: "toolbox:choose-folder",
  processFolder: "toolbox:process-folder",
  processProgress: "toolbox:process-progress",
  exportResults: "toolbox:export-results",
} as const;

export function emptyStatusCounts(): StatusCounts {
  return { success: 0, review: 0, unsupported: 0, failed: 0 };
}

export function countStatuses(results: FileResult[]): StatusCounts {
  return results.reduce((counts, result) => {
    if (result.status in counts) {
      counts[result.status as TerminalDocumentStatus] += 1;
    }
    return counts;
  }, emptyStatusCounts());
}
