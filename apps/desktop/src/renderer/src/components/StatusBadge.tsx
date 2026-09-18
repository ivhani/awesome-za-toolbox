import { AlertTriangle, Ban, Check, CircleX, LoaderCircle } from "lucide-react";
import type { DocumentStatus } from "../../../shared/contract";

const labels: Record<DocumentStatus, string> = {
  pending: "Waiting",
  processing: "Processing",
  success: "Ready",
  review: "Review",
  unsupported: "Unsupported",
  failed: "Failed",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const Icon = status === "success" ? Check
    : status === "review" ? AlertTriangle
      : status === "unsupported" ? Ban
        : status === "failed" ? CircleX
          : LoaderCircle;

  return (
    <span className={`status-badge status-${status}`}>
      <Icon size={14} aria-hidden="true" className={status === "processing" ? "spin" : undefined} />
      {labels[status]}
    </span>
  );
}
