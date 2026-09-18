import { ChevronRight, FileText } from "lucide-react";
import type { FileResult } from "../../../shared/contract";
import { StatusBadge } from "./StatusBadge";

export function ResultTable({
  results,
  selectedId,
  onSelect,
}: {
  results: FileResult[];
  selectedId?: string;
  onSelect: (result: FileResult) => void;
}) {
  return (
    <div className="table-shell">
      <table className="results-table">
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Type</th>
            <th scope="col">Status</th>
            <th scope="col" className="table-action"><span className="sr-only">Open details</span></th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr key={result.id} className={selectedId === result.id ? "is-selected" : undefined}>
              <td>
                <button className="row-button" type="button" onClick={() => onSelect(result)}>
                  <span className="file-icon"><FileText size={17} aria-hidden="true" /></span>
                  <span className="file-name">{result.fileName}</span>
                </button>
              </td>
              <td className="muted-cell">{documentLabel(result)}</td>
              <td><StatusBadge status={result.status} /></td>
              <td className="table-action">
                <button className="icon-button" type="button" aria-label={`Open details for ${result.fileName}`} onClick={() => onSelect(result)}>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function documentLabel(result: FileResult): string {
  if (result.normalized?.kind === "bank-statement") return result.normalized.value.institution;
  if (result.normalized?.kind === "municipal-statement") return result.normalized.value.municipality;
  if (result.status === "unsupported") return result.extension.replace(".", "").toUpperCase() || "Unknown";
  return "PDF";
}
