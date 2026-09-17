import { readFile } from "node:fs/promises";
import { inflateRawSync, inflateSync, unzipSync } from "node:zlib";
import pdfParse from "pdf-parse";
import { ToolboxError, assertReadableFile } from "@awesome-za/core";

export interface ExtractedPdfText {
  text: string;
  pages?: number;
}

export async function extractPdfText(filePath: string): Promise<ExtractedPdfText> {
  const buffer = await readPdfBuffer(filePath);

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

export async function extractPdfXfaDataset(filePath: string): Promise<string> {
  const buffer = await readPdfBuffer(filePath);

  for (const stream of extractPdfStreams(buffer)) {
    for (const candidate of decodePdfStreamCandidates(stream)) {
      const xml = extractXfaDatasetXml(candidate);
      if (xml) {
        return xml;
      }
    }
  }

  throw new ToolboxError("PDF_XFA_DATASET_NOT_FOUND", "No embedded XFA dataset XML was found in the PDF.");
}

async function readPdfBuffer(filePath: string): Promise<Buffer> {
  await assertReadableFile(filePath);

  const buffer = await readFile(filePath);
  if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new ToolboxError("INVALID_PDF", "Input file does not look like a PDF.");
  }
  return buffer;
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

function extractPdfStreams(buffer: Buffer): Buffer[] {
  const raw = buffer.toString("latin1");
  const matches = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  return matches.map((match) => Buffer.from(match[1] ?? "", "latin1"));
}

function decodePdfStreamCandidates(stream: Buffer): string[] {
  const decoded = [stream.toString("utf8")];

  for (const decode of [inflateSync, unzipSync, inflateRawSync]) {
    try {
      decoded.push(decode(stream).toString("utf8"));
    } catch {
      // Try the next PDF stream decoding mode.
    }
  }

  return decoded;
}

function extractXfaDatasetXml(text: string): string | undefined {
  const startMatch = text.match(/<(?:(?:[A-Za-z_][\w.-]*):)?datasets\b/i);
  if (startMatch?.index === undefined) {
    return undefined;
  }

  const endMatch = text.slice(startMatch.index).match(/<\/(?:(?:[A-Za-z_][\w.-]*):)?datasets>/i);
  if (!endMatch?.[0] || endMatch.index === undefined) {
    return undefined;
  }

  return text.slice(startMatch.index, startMatch.index + endMatch.index + endMatch[0].length);
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
