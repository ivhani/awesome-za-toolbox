import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { inflateRawSync, inflateSync, unzipSync } from "node:zlib";
import pdfParse from "pdf-parse";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { ToolboxError, assertReadableFile } from "@awesome-za/core";

const PDFJS_STANDARD_FONT_DATA_URL = `${fileURLToPath(new URL(
  "../../standard_fonts/",
  import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs"),
)).replaceAll("\\", "/").replace(/\/+$/, "")}/`;

export interface ExtractedPdfText {
  text: string;
  pages?: number;
}

export interface PdfLayoutTextItem {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedPdfLayoutText {
  text: string;
  pages: number;
  items: PdfLayoutTextItem[];
}

interface PdfJsTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
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

export async function extractPdfLayoutText(filePath: string): Promise<ExtractedPdfLayoutText> {
  const buffer = await readPdfBuffer(filePath);
  const document = await getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    standardFontDataUrl: PDFJS_STANDARD_FONT_DATA_URL,
    useSystemFonts: false,
  }).promise;
  const items: PdfLayoutTextItem[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent({
      disableNormalization: false,
      includeMarkedContent: false,
    });

    for (const item of content.items) {
      if (!isTextItem(item)) {
        continue;
      }

      const text = item.str.trim();
      if (!text) {
        continue;
      }

      items.push({
        page: pageNumber,
        text,
        x: roundCoordinate(item.transform[4] ?? 0),
        y: roundCoordinate(item.transform[5] ?? 0),
        width: roundCoordinate(item.width),
        height: roundCoordinate(item.height),
      });
    }
  }

  if (items.length === 0) {
    throw new ToolboxError("PDF_LAYOUT_TEXT_EXTRACTION_FAILED", "No positioned text was found in the PDF.");
  }

  return {
    text: renderLayoutText(items),
    pages: document.numPages,
    items,
  };
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

function renderLayoutText(items: PdfLayoutTextItem[]): string {
  const lines: string[] = [];
  const pageNumbers = [...new Set(items.map((item) => item.page))].sort((left, right) => left - right);

  for (const page of pageNumbers) {
    const pageItems = items.filter((item) => item.page === page).sort((left, right) => right.y - left.y || left.x - right.x);
    const rows: PdfLayoutTextItem[][] = [];

    for (const item of pageItems) {
      const row = rows.find((candidate) => Math.abs((candidate[0]?.y ?? item.y) - item.y) <= Math.max(2, item.height * 0.5));
      if (row) {
        row.push(item);
      } else {
        rows.push([item]);
      }
    }

    for (const row of rows) {
      lines.push(renderLayoutLine(row.sort((left, right) => left.x - right.x)));
    }
  }

  return normalizePdfText(lines.join("\n"));
}

function renderLayoutLine(items: PdfLayoutTextItem[]): string {
  let line = "";
  let previousRight: number | undefined;

  for (const item of items) {
    const gap = previousRight === undefined ? 0 : item.x - previousRight;
    const separator = gap > 18 ? "  " : gap > 2 ? " " : "";
    line += `${separator}${item.text}`;
    previousRight = Math.max(previousRight ?? item.x, item.x + item.width);
  }

  return line.trim();
}

function isTextItem(item: unknown): item is PdfJsTextItem {
  return typeof item === "object"
    && item !== null
    && "str" in item
    && "transform" in item
    && "width" in item
    && "height" in item;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
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
