// @vitest-environment node
import { describe, expect, it } from "vitest";
import { csvExportProvider, jsonExportProvider } from "../src/application/export-providers.js";
import type { FolderProcessResult } from "../src/shared/contract.js";

const result: FolderProcessResult = {
  sessionId: "session-1",
  displayName: "Synthetic folder",
  processedAt: "2026-09-18T10:00:00.000Z",
  counts: { success: 1, review: 0, unsupported: 1, failed: 0 },
  results: [
    {
      id: "file-0001",
      fileName: "statement.pdf",
      extension: ".pdf",
      status: "success",
      normalized: {
        kind: "bank-statement",
        value: {
          institution: "Synthetic Bank",
          period: { from: "2026-01-01", to: "2026-01-31" },
          transactions: [{ date: "2026-01-02", description: "Quoted, record", amount: 12.5, currency: "ZAR" }],
        },
      },
      warnings: [], errors: [], checks: [], candidates: [],
    },
    {
      id: "file-0002", fileName: "notes.txt", extension: ".txt", status: "unsupported",
      warnings: [{ code: "UNSUPPORTED_FILE_TYPE", message: "Only PDFs." }], errors: [], checks: [], candidates: [],
    },
  ],
};

describe("export providers", () => {
  it("produces structured JSON without inventing source paths", () => {
    const output = jsonExportProvider.serialize(result);
    const parsed = JSON.parse(output) as FolderProcessResult;
    expect(parsed.displayName).toBe("Synthetic folder");
    expect(parsed.results[0]?.fileName).toBe("statement.pdf");
    expect(output).not.toMatch(/[A-Za-z]:\\/);
  });

  it("produces generic row-oriented CSV with escaped values and unsupported rows", () => {
    const output = csvExportProvider.serialize(result);
    expect(output).toContain('"Quoted, record"');
    expect(output).toContain("notes.txt,unsupported,,file");
    expect(output).toContain("UNSUPPORTED_FILE_TYPE");
  });
});
