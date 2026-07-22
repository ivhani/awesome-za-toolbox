import { readFile } from "node:fs/promises";
import pdfParse from "pdf-parse";
import { ToolboxError, assertReadableFile } from "@awesome-za/core";

export interface ExtractedPdfText {
  text: string;
  pages?: number;
}

export async function extractPdfText(filePath: string): Promise<ExtractedPdfText> {
  await assertReadableFile(filePath);

  const buffer = await readFile(filePath);
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new ToolboxError("INVALID_PDF", "Input file does not look like a PDF.");
  }

  try {
    const parsed = await pdfParse(buffer);
    const text = normalizePdfText(parsed.text);
    if (text.length > 0) {
      return { text, pages: parsed.numpages };
    }
  } catch {
    // Fall through to a tiny literal-string extractor for simple synthetic PDFs.
  }

  const fallbackText = extractLiteralPdfStrings(buffer);
  if (fallbackText.length > 0) {
    return { text: fallbackText };
  }

  throw new ToolboxError("PDF_TEXT_EXTRACTION_FAILED", "No extractable text was found in the PDF.");
}

function normalizePdfText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function extractLiteralPdfStrings(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const matches = [...raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)];

  return matches
    .map((match) => unescapePdfLiteral(match[1] ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

function unescapePdfLiteral(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}
