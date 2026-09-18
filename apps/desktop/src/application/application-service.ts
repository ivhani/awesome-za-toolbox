import type { FolderProcessResult, ProcessProgress } from "../shared/contract.js";
import { exportProviders, type ExportProvider } from "./export-providers.js";
import { FolderProcessor } from "./folder-processor.js";

interface SelectedFolder {
  directoryPath: string;
  displayName: string;
}

export class ApplicationService {
  private readonly selections = new Map<string, SelectedFolder>();
  private readonly sessions = new Map<string, FolderProcessResult>();

  constructor(
    private readonly processor = new FolderProcessor(),
    private readonly providers: ExportProvider[] = exportProviders,
  ) {}

  registerSelection(folder: SelectedFolder): string {
    const token = crypto.randomUUID();
    this.selections.set(token, folder);
    return token;
  }

  async processFolder(
    request: { requestId: string; selectionToken: string },
    onProgress: (progress: ProcessProgress) => void,
  ): Promise<FolderProcessResult> {
    const selection = this.selections.get(request.selectionToken);
    if (!selection) {
      throw new Error("The folder selection has expired. Choose the folder again.");
    }

    const result = await this.processor.process({
      requestId: request.requestId,
      directoryPath: selection.directoryPath,
      displayName: selection.displayName,
    }, onProgress);
    this.sessions.set(result.sessionId, result);
    return result;
  }

  getExport(sessionId: string, format: "json" | "csv"): { result: FolderProcessResult; provider: ExportProvider } {
    const result = this.sessions.get(sessionId);
    if (!result) {
      throw new Error("The result session has expired. Process the folder again.");
    }
    const provider = this.providers.find((candidate) => candidate.format === format);
    if (!provider) {
      throw new Error("The selected export format is not available.");
    }
    return { result, provider };
  }
}
