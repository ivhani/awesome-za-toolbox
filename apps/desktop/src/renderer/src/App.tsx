import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  FileArchive,
  FileJson,
  FolderOpen,
  ListFilter,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Table2,
} from "lucide-react";
import type { DesktopApplication, DocumentStatus, FileResult, TerminalDocumentStatus } from "../../shared/contract";
import { DetailPanel } from "./components/DetailPanel";
import { ResultTable } from "./components/ResultTable";
import { useDocumentSession } from "./features/use-document-session";

type Filter = "all" | TerminalDocumentStatus;

export function App({ application }: { application: DesktopApplication }) {
  const session = useDocumentSession(application);
  const visibleResults = session.progress?.results ?? session.result?.results ?? [];
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<FileResult>();

  useEffect(() => {
    if (selected) {
      setSelected(visibleResults.find((result) => result.id === selected.id));
    }
  }, [selected?.id, visibleResults]);

  const filteredResults = useMemo(() => filter === "all"
    ? visibleResults
    : visibleResults.filter((result) => result.status === filter), [filter, visibleResults]);
  const isWorking = session.phase === "processing" || session.phase === "selecting";

  return (
    <div className="app-frame">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">ZA</span>
          <div><strong>Awesome ZA Toolbox</strong><span>Document workspace</span></div>
        </div>
        <div className="privacy-mark"><LockKeyhole size={15} aria-hidden="true" /> Local only</div>
      </header>

      <main className="workspace">
        <ProcessingRail active={session.phase} />
        <div className="workspace-main">
          {(session.phase === "idle" || session.phase === "selecting") && (
            <WelcomePanel selecting={session.phase === "selecting"} notice={session.notice} onChoose={session.chooseFolder} />
          )}

          {session.phase === "error" && (
            <section className="state-panel error-panel" aria-live="polite">
              <span className="state-icon error-icon"><AlertCircle size={25} /></span>
              <span className="eyebrow">Recoverable error</span>
              <h1>We could not finish that run.</h1>
              <p>{session.error}</p>
              <div className="button-row">
                <button className="primary-button" type="button" onClick={session.retry}><RefreshCw size={17} /> Try again</button>
                <button className="secondary-button" type="button" onClick={session.chooseFolder}><FolderOpen size={17} /> Choose another folder</button>
              </div>
            </section>
          )}

          {session.phase === "empty" && (
            <section className="state-panel empty-panel" aria-live="polite">
              <span className="state-icon"><FileArchive size={25} /></span>
              <span className="eyebrow">Folder scanned</span>
              <h1>No files found.</h1>
              <p>The selected folder is empty. Add documents or choose a different folder.</p>
              <button className="primary-button" type="button" onClick={session.chooseFolder}><FolderOpen size={17} /> Choose another folder</button>
            </section>
          )}

          {(session.phase === "processing" || session.phase === "ready") && (
            <section className="results-workspace">
              <div className="results-heading">
                <div>
                  <span className="eyebrow">{session.phase === "processing" ? "Processing folder" : "Run complete"}</span>
                  <h1>{session.progress?.displayName ?? session.result?.displayName}</h1>
                  {session.phase === "processing" ? (
                    <p aria-live="polite">{progressCopy(session.progress?.completed ?? 0, session.progress?.total ?? 0, session.progress?.currentFileName)}</p>
                  ) : (
                    <p>{visibleResults.length} {visibleResults.length === 1 ? "file" : "files"} reviewed locally. Select a row to inspect its normalized output.</p>
                  )}
                </div>
                <div className="heading-actions">
                  <button className="secondary-button compact-button" type="button" onClick={session.chooseFolder} disabled={isWorking}><FolderOpen size={16} /> New folder</button>
                  <div className="export-group" aria-label="Export results">
                    <button type="button" onClick={() => session.exportResults("json")} disabled={!session.result || Boolean(session.exporting)}><FileJson size={16} /> JSON</button>
                    <button type="button" onClick={() => session.exportResults("csv")} disabled={!session.result || Boolean(session.exporting)}><Table2 size={16} /> CSV</button>
                  </div>
                </div>
              </div>

              {session.phase === "processing" && (
                <progress className="progress-bar" max={session.progress?.total || 1} value={session.progress?.completed ?? 0} aria-label="Folder processing progress" />
              )}

              {(session.notice || session.error) && <div className={`notice ${session.error ? "notice-error" : ""}`} role="status">{session.error ?? session.notice}</div>}

              <StatusFilters results={visibleResults} selected={filter} onSelect={setFilter} />
              <div className="result-layout">
                <div className="result-list">
                  <div className="list-toolbar">
                    <span><ListFilter size={15} /> {filteredResults.length} shown</span>
                    <span>Files stay in their original folder</span>
                  </div>
                  {filteredResults.length > 0 ? (
                    <ResultTable results={filteredResults} selectedId={selected?.id} onSelect={setSelected} />
                  ) : (
                    <div className="filtered-empty">No files match this status.</div>
                  )}
                </div>
                <DetailPanel result={selected} onClose={() => setSelected(undefined)} />
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function WelcomePanel({ selecting, notice, onChoose }: { selecting: boolean; notice?: string; onChoose: () => void }) {
  return (
    <section className="welcome-layout">
      <div className="welcome-copy">
        <span className="eyebrow">Private document processing</span>
        <h1>Choose a folder.<br /><em>Keep every file local.</em></h1>
        <p>Process FNB bank statements and City of Johannesburg municipal statements into consistent, reviewable data. Mixed folders are welcome; one difficult file will not stop the rest.</p>
        <button className="primary-button choose-button" type="button" onClick={onChoose} disabled={selecting}>
          <FolderOpen size={19} aria-hidden="true" />
          {selecting ? "Opening folder picker…" : "Choose folder"}
          {!selecting && <ArrowRight size={18} aria-hidden="true" />}
        </button>
        {notice && <div className="notice" role="status">{notice}</div>}
        <div className="privacy-note"><ShieldCheck size={18} /><span><strong>No uploads. No accounts.</strong> Parsing and export happen on this computer.</span></div>
      </div>
      <div className="ledger-preview" aria-hidden="true">
        <div className="preview-head"><span>Folder preview</span><span>04 files</span></div>
        {[
          ["January-statement.pdf", "ready"],
          ["Municipal-account.pdf", "review"],
          ["notes.txt", "unsupported"],
          ["March-statement.pdf", "ready"],
        ].map(([name, status], index) => (
          <div className={`preview-row preview-row-${index + 1}`} key={name}>
            <span className={`preview-dot dot-${status}`} />
            <span>{name}</span>
            <small>{status}</small>
          </div>
        ))}
        <div className="preview-footer"><span>3 documents processed</span><Check size={16} /></div>
      </div>
    </section>
  );
}

function ProcessingRail({ active }: { active: string }) {
  const activeIndex = active === "idle" || active === "selecting" ? 0 : active === "processing" ? 1 : 2;
  const steps = ["Select", "Process", "Review", "Export"];
  return (
    <nav className="processing-rail" aria-label="Document workflow">
      <span className="rail-label">Workflow</span>
      <ol>
        {steps.map((step, index) => <li key={step} className={index <= activeIndex ? "is-active" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}
      </ol>
      <div className="rail-local"><span className="local-pulse" />Offline ready</div>
    </nav>
  );
}

function StatusFilters({ results, selected, onSelect }: { results: FileResult[]; selected: Filter; onSelect: (filter: Filter) => void }) {
  const filters: { value: Filter; label: string; status?: DocumentStatus }[] = [
    { value: "all", label: "All files" },
    { value: "success", label: "Ready", status: "success" },
    { value: "review", label: "Review", status: "review" },
    { value: "unsupported", label: "Unsupported", status: "unsupported" },
    { value: "failed", label: "Failed", status: "failed" },
  ];
  return (
    <div className="status-filters" aria-label="Filter results by status">
      {filters.map((filter) => {
        const count = filter.status ? results.filter((result) => result.status === filter.status).length : results.length;
        return <button key={filter.value} className={selected === filter.value ? "is-selected" : undefined} type="button" aria-pressed={selected === filter.value} onClick={() => onSelect(filter.value)}><span>{filter.label}</span><strong>{String(count).padStart(2, "0")}</strong></button>;
      })}
    </div>
  );
}

function progressCopy(completed: number, total: number, current?: string): string {
  if (total === 0) return "Scanning the selected folder…";
  if (completed === total) return `Finalizing ${total} ${total === 1 ? "file" : "files"}…`;
  return `${completed} of ${total} complete${current ? ` · ${current}` : ""}`;
}
