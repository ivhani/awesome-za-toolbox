#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { parseFnbStatement } from "@awesome-za/fnb";
import { parseEjoburgStatement } from "@awesome-za/ejoburg";
import { extractPdfText } from "@awesome-za/pdf-utils";
import type { BankStatement, MunicipalStatement } from "@awesome-za/schemas";
import type { ParseResult } from "@awesome-za/core";

type OutputFormat = "json" | "csv";

interface CliOptions {
  command: string[];
  filePath?: string;
  format: OutputFormat;
  output?: string;
}

async function main(argv: string[]): Promise<number> {
  const options = parseArgs(argv);
  if (options.command.join(" ") === "dev extract-text") {
    const output = await runExtractTextCommand(options);
    if (options.output) {
      await writeFile(options.output, output);
    } else {
      process.stdout.write(output);
    }
    return 0;
  }

  const result = await runCommand(options);

  if (!result.ok) {
    for (const error of result.errors) {
      process.stderr.write(`${error.code}: ${error.message}\n`);
    }
    return 1;
  }

  for (const warning of result.warnings) {
    process.stderr.write(`warning ${warning.code}: ${warning.message}\n`);
  }

  const output = serializeResult(result, options.format);
  if (options.output) {
    await writeFile(options.output, output);
  } else {
    process.stdout.write(output);
  }

  return 0;
}

function parseArgs(argv: string[]): CliOptions {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const positional: string[] = [];
  let format: OutputFormat = "json";
  let output: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--format") {
      const selectedFormat = argv[index + 1];
      if (selectedFormat !== "json" && selectedFormat !== "csv") {
        throw new Error("Unsupported format. Use --format json or --format csv.");
      }
      format = selectedFormat;
      index += 1;
      continue;
    }

    if (value === "--output") {
      output = argv[index + 1];
      if (!output) {
        throw new Error("--output requires a path.");
      }
      index += 1;
      continue;
    }

    if (value?.startsWith("--")) {
      throw new Error(`Unknown option: ${value}`);
    }

    if (value) {
      positional.push(value);
    }
  }

  if (positional[0] === "dev" && positional[1] === "extract-text") {
    return {
      command: positional.slice(0, 2),
      filePath: positional[2],
      format,
      output,
    };
  }

  return {
    command: positional.slice(0, 3),
    filePath: positional[3],
    format,
    output,
  };
}

async function runExtractTextCommand(options: CliOptions): Promise<string> {
  if (!options.filePath) {
    throw new Error("Missing PDF path.");
  }

  const extracted = await extractPdfText(options.filePath);
  return `${extracted.text}\n`;
}

async function runCommand(options: CliOptions): Promise<ParseResult<BankStatement | MunicipalStatement>> {
  if (!options.filePath) {
    throw new Error("Missing PDF path.");
  }

  const command = options.command.join(" ");
  if (command === "bank fnb parse") {
    return parseFnbStatement({ filePath: options.filePath });
  }

  if (command === "municipal ejoburg parse") {
    return parseEjoburgStatement({ filePath: options.filePath });
  }

  throw new Error(`Unknown command: ${command || "(empty)"}`);
}

function serializeResult(result: ParseResult<BankStatement | MunicipalStatement>, format: OutputFormat): string {
  if (format === "json") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  if (isBankStatement(result.data)) {
    return bankStatementToCsv(result.data);
  }

  if (isMunicipalStatement(result.data)) {
    return municipalStatementToCsv(result.data);
  }

  throw new Error("Cannot serialize missing parse data.");
}

function isBankStatement(value: BankStatement | MunicipalStatement | undefined): value is BankStatement {
  return Boolean(value && "transactions" in value);
}

function isMunicipalStatement(value: BankStatement | MunicipalStatement | undefined): value is MunicipalStatement {
  return Boolean(value && "charges" in value && "payments" in value);
}

function bankStatementToCsv(statement: BankStatement): string {
  const rows = [
    ["date", "description", "amount", "currency", "balance", "reference"],
    ...statement.transactions.map((transaction) => [
      transaction.date,
      transaction.description,
      String(transaction.amount),
      transaction.currency,
      transaction.balance === undefined ? "" : String(transaction.balance),
      transaction.reference ?? "",
    ]),
  ];

  return rows.map(formatCsvRow).join("\n") + "\n";
}

function municipalStatementToCsv(statement: MunicipalStatement): string {
  const rows = [
    ["type", "date", "description", "amount", "currency", "reference"],
    ...statement.charges.map((item) => ["charge", item.date, item.description, String(item.amount), item.currency, item.reference ?? ""]),
    ...statement.payments.map((item) => ["payment", item.date, item.description, String(item.amount), item.currency, item.reference ?? ""]),
  ];

  return rows.map(formatCsvRow).join("\n") + "\n";
}

function formatCsvRow(values: string[]): string {
  return values.map((value) => {
    if (!/[",\n]/.test(value)) {
      return value;
    }
    return `"${value.replace(/"/g, '""')}"`;
  }).join(",");
}

function printHelp(): void {
  process.stdout.write(`za-toolbox

Usage:
  za-toolbox bank fnb parse <pdf> --format json|csv --output <path>
  za-toolbox municipal ejoburg parse <pdf> --format json|csv --output <path>
  za-toolbox dev extract-text <pdf> --output <path>

Options:
  --format json|csv   Output format. Defaults to json.
  --output <path>     Write output to a file. Defaults to stdout.
`);
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown CLI failure.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
