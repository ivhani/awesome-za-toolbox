import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/renderer/src/App";
import type { DesktopApplication, FolderProcessResult } from "../src/shared/contract";

const completed: FolderProcessResult = {
  sessionId: "session-1",
  displayName: "Synthetic statements",
  processedAt: "2026-09-18T10:00:00.000Z",
  counts: { success: 1, review: 0, unsupported: 1, failed: 0 },
  results: [
    {
      id: "file-0001", fileName: "statement.pdf", extension: ".pdf", status: "success",
      normalized: {
        kind: "bank-statement",
        value: {
          institution: "Synthetic Bank", accountNumberMasked: "****1234",
          period: { from: "2026-01-01", to: "2026-01-31" }, openingBalance: 10, closingBalance: 20,
          transactions: [{ date: "2026-01-02", description: "Synthetic deposit", amount: 10, currency: "ZAR", balance: 20 }],
        },
      },
      warnings: [], errors: [], checks: [{ name: "balance", status: "passed" }],
      candidates: [{ kind: "bank-statement", parser: "synthetic", confidence: "high", ok: true, warnings: [], errors: [] }],
    },
    {
      id: "file-0002", fileName: "notes.txt", extension: ".txt", status: "unsupported",
      warnings: [{ code: "UNSUPPORTED_FILE_TYPE", message: "Only PDFs." }], errors: [], checks: [], candidates: [],
    },
  ],
};

describe("App", () => {
  it("shows the local-first folder selection state", () => {
    render(<App application={mockApplication()} />);
    expect(screen.getByRole("heading", { name: /choose a folder/i })).toBeInTheDocument();
    expect(screen.getByText(/No uploads. No accounts./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose folder/i })).toBeEnabled();
  });

  it("treats a cancelled folder picker as a non-error state", async () => {
    const application = mockApplication({ chooseFolder: vi.fn().mockResolvedValue({ status: "cancelled" }) });
    render(<App application={application} />);
    fireEvent.click(screen.getByRole("button", { name: /choose folder/i }));
    expect(await screen.findByText(/selection cancelled/i)).toBeInTheDocument();
    expect(screen.queryByText(/recoverable error/i)).not.toBeInTheDocument();
  });

  it("renders status filters, details, and export actions after processing", async () => {
    const exportResults = vi.fn().mockResolvedValue({ status: "saved", fileName: "results.json" });
    const application = mockApplication({
      chooseFolder: vi.fn().mockResolvedValue({ status: "selected", selectionToken: "token-1", displayName: "Synthetic statements" }),
      processFolder: vi.fn().mockResolvedValue(completed),
      exportResults,
    });
    render(<App application={application} />);
    fireEvent.click(screen.getByRole("button", { name: /choose folder/i }));

    expect(await screen.findByRole("heading", { name: "Synthetic statements" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ready 01/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "statement.pdf" }));
    expect(screen.getByRole("complementary", { name: /details for statement.pdf/i })).toBeInTheDocument();
    expect(screen.getByText("****1234")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /JSON/i }));
    await waitFor(() => expect(exportResults).toHaveBeenCalledWith({ sessionId: "session-1", format: "json" }));
    expect(await screen.findByText(/results.json was exported/i)).toBeInTheDocument();
  });

  it("shows an empty-folder recovery action", async () => {
    const application = mockApplication({
      chooseFolder: vi.fn().mockResolvedValue({ status: "selected", selectionToken: "token-empty", displayName: "Empty folder" }),
      processFolder: vi.fn().mockResolvedValue({ ...completed, sessionId: "session-empty", displayName: "Empty folder", results: [], counts: { success: 0, review: 0, unsupported: 0, failed: 0 } }),
    });
    render(<App application={application} />);
    fireEvent.click(screen.getByRole("button", { name: /choose folder/i }));
    expect(await screen.findByRole("heading", { name: /no files found/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose another folder/i })).toBeEnabled();
  });

  it("shows a recoverable error without exposing exception details", async () => {
    const application = mockApplication({
      chooseFolder: vi.fn().mockResolvedValue({ status: "selected", selectionToken: "token-error", displayName: "Unavailable" }),
      processFolder: vi.fn().mockRejectedValue(new Error("C:\\Private\\Statement.pdf secret error")),
    });
    render(<App application={application} />);
    fireEvent.click(screen.getByRole("button", { name: /choose folder/i }));
    expect(await screen.findByText(/recoverable error/i)).toBeInTheDocument();
    expect(screen.queryByText(/Private|secret error/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeEnabled();
  });
});

function mockApplication(overrides: Partial<DesktopApplication> = {}): DesktopApplication {
  return {
    chooseFolder: vi.fn().mockResolvedValue({ status: "cancelled" }),
    processFolder: vi.fn().mockResolvedValue(completed),
    exportResults: vi.fn().mockResolvedValue({ status: "cancelled" }),
    ...overrides,
  };
}
