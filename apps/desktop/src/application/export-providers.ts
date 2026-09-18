import type { FolderProcessResult } from "../shared/contract.js";

export interface ExportProvider {
  readonly format: "json" | "csv";
  readonly extension: string;
  readonly contentType: string;
  serialize(result: FolderProcessResult): string;
}

export const jsonExportProvider: ExportProvider = {
  format: "json",
  extension: "json",
  contentType: "application/json",
  serialize: (result) => `${JSON.stringify(result, null, 2)}\n`,
};

export const csvExportProvider: ExportProvider = {
  format: "csv",
  extension: "csv",
  contentType: "text/csv",
  serialize(result) {
    const rows: string[][] = [[
      "file_name",
      "status",
      "document_type",
      "record_type",
      "date",
      "description",
      "amount",
      "currency",
      "balance",
      "reference",
      "warning_codes",
      "error_codes",
    ]];

    for (const file of result.results) {
      const common = [
        file.fileName,
        file.status,
        file.normalized?.kind ?? "",
      ];
      const diagnostics = [
        file.warnings.map((warning) => warning.code).join("|"),
        file.errors.map((error) => error.code).join("|"),
      ];

      if (file.normalized?.kind === "bank-statement") {
        for (const transaction of file.normalized.value.transactions) {
          rows.push([
            ...common,
            "transaction",
            transaction.date,
            transaction.description,
            String(transaction.amount),
            transaction.currency,
            transaction.balance === undefined ? "" : String(transaction.balance),
            transaction.reference ?? "",
            ...diagnostics,
          ]);
        }
      } else if (file.normalized?.kind === "municipal-statement") {
        for (const item of file.normalized.value.charges) {
          rows.push([...common, "charge", item.date, item.description, String(item.amount), item.currency, "", item.reference ?? "", ...diagnostics]);
        }
        for (const item of file.normalized.value.payments) {
          rows.push([...common, "payment", item.date, item.description, String(item.amount), item.currency, "", item.reference ?? "", ...diagnostics]);
        }
      } else {
        rows.push([...common, "file", "", "", "", "", "", "", ...diagnostics]);
      }
    }

    return `${rows.map(formatCsvRow).join("\n")}\n`;
  },
};

export const exportProviders: ExportProvider[] = [jsonExportProvider, csvExportProvider];

function formatCsvRow(values: string[]): string {
  return values.map((value) => /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(",");
}
