import { useCallback, useState } from "react";
import type {
  DesktopApplication,
  ExportFormat,
  FolderProcessResult,
  FolderSelection,
  ProcessProgress,
} from "../../../shared/contract.js";

export type SessionPhase = "idle" | "selecting" | "processing" | "ready" | "empty" | "error";

export function useDocumentSession(application: DesktopApplication) {
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [selection, setSelection] = useState<Extract<FolderSelection, { status: "selected" }>>();
  const [progress, setProgress] = useState<ProcessProgress>();
  const [result, setResult] = useState<FolderProcessResult>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [exporting, setExporting] = useState<ExportFormat>();

  const processSelection = useCallback(async (selected: Extract<FolderSelection, { status: "selected" }>) => {
    setPhase("processing");
    setError(undefined);
    setNotice(undefined);
    setResult(undefined);
    setProgress(undefined);
    const requestId = crypto.randomUUID();
    try {
      const completed = await application.processFolder({ requestId, selectionToken: selected.selectionToken }, setProgress);
      setResult(completed);
      setProgress(undefined);
      setPhase(completed.results.length === 0 ? "empty" : "ready");
    } catch {
      setProgress(undefined);
      setPhase("error");
      setError("The folder could not be processed. Check that it is still available, then try again.");
    }
  }, [application]);

  const chooseFolder = useCallback(async () => {
    setPhase("selecting");
    setError(undefined);
    setNotice(undefined);
    try {
      const selected = await application.chooseFolder();
      if (selected.status === "cancelled") {
        setPhase(result ? "ready" : "idle");
        setNotice("Folder selection cancelled. Nothing was changed.");
        return;
      }
      setSelection(selected);
      await processSelection(selected);
    } catch {
      setPhase("error");
      setError("The folder picker could not be opened. Try again.");
    }
  }, [application, processSelection, result]);

  const retry = useCallback(async () => {
    if (selection) await processSelection(selection);
    else await chooseFolder();
  }, [chooseFolder, processSelection, selection]);

  const exportResults = useCallback(async (format: ExportFormat) => {
    if (!result) return;
    setExporting(format);
    setNotice(undefined);
    try {
      const exported = await application.exportResults({ sessionId: result.sessionId, format });
      setNotice(exported.status === "saved" ? `${exported.fileName} was exported.` : "Export cancelled. No file was written.");
    } catch {
      setError("The export could not be saved. Choose another destination and try again.");
    } finally {
      setExporting(undefined);
    }
  }, [application, result]);

  return {
    phase,
    progress,
    result,
    notice,
    error,
    exporting,
    chooseFolder,
    retry,
    exportResults,
  };
}
