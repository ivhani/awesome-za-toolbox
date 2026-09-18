import { AlertTriangle, CheckCircle2, CircleX, FileQuestion, X } from "lucide-react";
import type { FileResult, NormalizedDocument } from "../../../shared/contract";
import { StatusBadge } from "./StatusBadge";

export function DetailPanel({ result, onClose }: { result?: FileResult; onClose: () => void }) {
  if (!result) return null;
  return (
    <aside className="detail-panel" aria-label={`Details for ${result.fileName}`}>
      <header className="detail-header">
        <div>
          <span className="eyebrow">File detail</span>
          <h2>{result.fileName}</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Close file details" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="detail-status"><StatusBadge status={result.status} /></div>
      {result.normalized ? <NormalizedSummary document={result.normalized} /> : (
        <div className="no-data-callout">
          <FileQuestion size={21} aria-hidden="true" />
          <p>No normalized records are available for this file.</p>
        </div>
      )}
      <DiagnosticList title="Warnings" items={result.warnings} icon="warning" />
      <DiagnosticList title="Errors" items={result.errors} icon="error" />
      {result.checks.length > 0 && (
        <section className="detail-section">
          <h3>Checks</h3>
          <ul className="check-list">
            {result.checks.map((check) => (
              <li key={check.name}>
                {check.status === "passed" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span><strong>{humanize(check.name)}</strong>{check.message && <small>{check.message}</small>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {result.candidates.length > 0 && (
        <section className="detail-section">
          <h3>Parser attempts</h3>
          <ul className="candidate-list">
            {result.candidates.map((candidate) => (
              <li key={candidate.parser}>
                <span>{candidate.kind === "bank-statement" ? "Bank" : "Municipal"}</span>
                <strong>{candidate.ok ? `${candidate.confidence} confidence` : "Not recognized"}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function NormalizedSummary({ document }: { document: NormalizedDocument }) {
  if (document.kind === "bank-statement") {
    const statement = document.value;
    return (
      <section className="detail-section">
        <h3>Normalized statement</h3>
        <dl className="summary-grid">
          <div><dt>Institution</dt><dd>{statement.institution}</dd></div>
          <div><dt>Period</dt><dd>{formatPeriod(statement.period)}</dd></div>
          <div><dt>Account</dt><dd>{statement.accountNumberMasked ?? "Not provided"}</dd></div>
          <div><dt>Transactions</dt><dd>{statement.transactions.length}</dd></div>
          <div><dt>Opening</dt><dd>{formatMoney(statement.openingBalance)}</dd></div>
          <div><dt>Closing</dt><dd>{formatMoney(statement.closingBalance)}</dd></div>
        </dl>
        <RecordPreview rows={statement.transactions.map((item) => ({ date: item.date, description: item.description, amount: item.amount }))} />
      </section>
    );
  }
  const statement = document.value;
  const records = [...statement.charges, ...statement.payments];
  return (
    <section className="detail-section">
      <h3>Normalized statement</h3>
      <dl className="summary-grid">
        <div><dt>Municipality</dt><dd>{statement.municipality}</dd></div>
        <div><dt>Period</dt><dd>{formatPeriod(statement.billingPeriod)}</dd></div>
        <div><dt>Account</dt><dd>{statement.accountNumber ?? "Not provided"}</dd></div>
        <div><dt>Records</dt><dd>{records.length}</dd></div>
        <div><dt>Opening</dt><dd>{formatMoney(statement.openingBalance)}</dd></div>
        <div><dt>Closing</dt><dd>{formatMoney(statement.closingBalance)}</dd></div>
      </dl>
      <RecordPreview rows={records.map((item) => ({ date: item.date, description: item.description, amount: item.amount }))} />
    </section>
  );
}

function RecordPreview({ rows }: { rows: { date: string; description: string; amount: number }[] }) {
  return (
    <div className="record-preview">
      <div className="record-preview-heading"><span>Record preview</span><small>First {Math.min(rows.length, 6)} of {rows.length}</small></div>
      {rows.slice(0, 6).map((row, index) => (
        <div className="record-row" key={`${row.date}-${row.description}-${index}`}>
          <time>{row.date}</time><span>{row.description}</span><strong>{formatMoney(row.amount)}</strong>
        </div>
      ))}
    </div>
  );
}

function DiagnosticList({ title, items, icon }: { title: string; items: { code: string; message: string }[]; icon: "warning" | "error" }) {
  if (items.length === 0) return null;
  const Icon = icon === "warning" ? AlertTriangle : CircleX;
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      <ul className={`diagnostic-list diagnostic-${icon}`}>
        {items.map((item, index) => <li key={`${item.code}-${index}`}><Icon size={16} /><span><strong>{humanize(item.code)}</strong><small>{item.message}</small></span></li>)}
      </ul>
    </section>
  );
}

const moneyFormatter = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" });
function formatMoney(value?: number): string { return value === undefined ? "Not provided" : moneyFormatter.format(value); }
function formatPeriod(period: { from: string; to: string }): string { return `${period.from} — ${period.to}`; }
function humanize(value: string): string { return value.toLowerCase().replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()); }
