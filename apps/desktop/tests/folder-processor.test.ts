// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ParseResult } from "@awesome-za/core";
import type { BankStatement, MunicipalStatement } from "@awesome-za/schemas";
import { FolderProcessor } from "../src/application/folder-processor.js";
import type { ParserAdapter } from "../src/application/parser-dispatch.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("FolderProcessor", () => {
  it("keeps stable rows, marks unsupported files, and continues after a failure", async () => {
    const directory = await createDirectory(["b-fails.pdf", "a-ready.pdf", "readme.txt"]);
    const progressSnapshots: string[][] = [];
    const parser: ParserAdapter = {
      kind: "bank-statement",
      parse: async (filePath) => path.basename(filePath).startsWith("a-") ? success() : failure(filePath),
    };
    const processor = new FolderProcessor({
      parsers: [parser],
      createSessionId: () => "session-1",
      now: () => new Date("2026-09-18T10:00:00.000Z"),
    });

    const result = await processor.process({ requestId: "request-1", directoryPath: directory, displayName: "synthetic" }, (progress) => {
      progressSnapshots.push(progress.results.map((item) => `${item.id}:${item.fileName}:${item.status}`));
    });

    expect(result.results.map((item) => item.fileName)).toEqual(["a-ready.pdf", "b-fails.pdf", "readme.txt"]);
    expect(result.results.map((item) => item.status)).toEqual(["success", "failed", "unsupported"]);
    expect(result.counts).toEqual({ success: 1, review: 0, unsupported: 1, failed: 1 });
    expect(progressSnapshots.every((snapshot) => snapshot.map((row) => row.split(":").slice(0, 2).join(":"))
      .join("|") === "file-0001:a-ready.pdf|file-0002:b-fails.pdf|file-0003:readme.txt")).toBe(true);
    expect(result.results[1]?.errors[0]?.message).not.toContain(directory);
  });

  it("returns an empty, successful session for an empty folder", async () => {
    const directory = await createDirectory([]);
    const result = await new FolderProcessor({ createSessionId: () => "session-empty" })
      .process({ requestId: "request-empty", directoryPath: directory, displayName: "empty" }, () => undefined);
    expect(result.results).toEqual([]);
    expect(result.counts).toEqual({ success: 0, review: 0, unsupported: 0, failed: 0 });
  });
});

async function createDirectory(files: string[]): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "za-toolbox-desktop-"));
  temporaryDirectories.push(directory);
  await Promise.all(files.map((file) => writeFile(path.join(directory, file), "synthetic fixture")));
  return directory;
}

function success(): ParseResult<BankStatement | MunicipalStatement> {
  return {
    ok: true,
    data: {
      institution: "Synthetic Bank",
      period: { from: "2026-01-01", to: "2026-01-31" },
      transactions: [{ date: "2026-01-02", description: "Synthetic", amount: 1, currency: "ZAR" }],
    },
    warnings: [],
    errors: [],
    metadata: { parser: "synthetic", parserVersion: "1", sourceFileName: "synthetic.pdf", confidence: "high", checks: [] },
  };
}

function failure(filePath: string): ParseResult<BankStatement | MunicipalStatement> {
  return {
    ok: false,
    warnings: [],
    errors: [{ code: "NOT_RECOGNIZED", message: `Could not parse ${filePath}` }],
    metadata: { parser: "synthetic", parserVersion: "1", sourceFileName: path.basename(filePath), confidence: "low", checks: [] },
  };
}
