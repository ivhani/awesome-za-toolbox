import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";

export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function createSyntheticPdf(filePath: string, lines: string[]): Promise<void> {
  const content = lines
    .map((line, index) => `BT /F1 12 Tf 50 ${750 - index * 16} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");

  await writeSyntheticPdf(filePath, [content]);
}

export async function createSyntheticPositionedPdf(
  filePath: string,
  items: { text: string; x: number; y: number; size?: number }[],
): Promise<void> {
  const content = items
    .map((item) => `BT /F1 ${item.size ?? 12} Tf ${item.x} ${item.y} Td (${escapePdfText(item.text)}) Tj ET`)
    .join("\n");

  await writeSyntheticPdf(filePath, [content]);
}

function writeSyntheticPdf(filePath: string, contentStreams: string[]): Promise<void> {
  const content = contentStreams.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return writeFile(filePath, pdf, "latin1");
}

export async function createSyntheticXfaPdf(
  filePath: string,
  xfaXml: string,
  lines: string[] = adobeFormPlaceholderLines(),
  options: { compressedFinalByte?: number } = {},
): Promise<void> {
  const content = lines
    .map((line, index) => `BT /F1 12 Tf 50 ${750 - index * 16} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");
  const xfaStream = deflateXfaStream(xfaXml, options.compressedFinalByte);

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${xfaStream.length} /Filter /FlateDecode >>\nstream\n${xfaStream.toString("latin1")}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  await writeFile(filePath, pdf, "latin1");
}

export function syntheticCojXfaDataset(options: { totalDue?: string } = {}): string {
  const totalDue = options.totalDue ?? "750.00";
  return `<?xml version="1.0" encoding="UTF-8"?>
<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
  <xfa:data>
    <Bill>
      <BillHeader>
        <PersonalDetails>
          <Date>2026/01/31</Date>
          <Period>2026/01</Period>
        </PersonalDetails>
        <InvoiceDetails>
          <AccountNumber>999000111</AccountNumber>
          <InvoiceNumber>INV-2026-01</InvoiceNumber>
        </InvoiceDetails>
      </BillHeader>
      <Summary>
        <BillSummaryDetails>
          <TotalDue>${totalDue}</TotalDue>
          <SummaryBreakdown>
            <Description>Previous Account Balance</Description>
            <Amount>500.00</Amount>
          </SummaryBreakdown>
          <SummaryBreakdown>
            <Description>Current Charges (Excl. VAT)</Description>
            <Amount>650.00</Amount>
          </SummaryBreakdown>
          <SummaryBreakdown>
            <Description>VAT @ 15%</Description>
            <Amount>100.00</Amount>
          </SummaryBreakdown>
        </BillSummaryDetails>
      </Summary>
      <Body>
        <CurrentCharges>
          <TotalDue>${totalDue}</TotalDue>
        </CurrentCharges>
        <CategoryType>
          <CategoryName>Water</CategoryName>
          <CategoryTable>
            <CategoryLineItem>
              <ItemDescription>Consumption charge</ItemDescription>
              <ItemAmount>400.00</ItemAmount>
            </CategoryLineItem>
            <CategoryLineItem>
              <ItemDescription>Sanitation charge</ItemDescription>
              <ItemAmount>250.00</ItemAmount>
            </CategoryLineItem>
          </CategoryTable>
        </CategoryType>
        <CategoryType>
          <CategoryName>Payments</CategoryName>
          <CategoryTable>
            <CategoryLineItem>
              <ItemDescription>Payment received</ItemDescription>
              <ItemAmount>500.00</ItemAmount>
            </CategoryLineItem>
          </CategoryTable>
        </CategoryType>
      </Body>
    </Bill>
  </xfa:data>
</xfa:datasets>`;
}

export function syntheticCojXfaSummaryAdjustmentsDataset(options: {
  creditBalanceTransfer?: string;
  detailedVat?: string;
  totalDue?: string;
} = {}): string {
  const detailedVat = options.detailedVat ?? "15.00";
  const totalDue = options.totalDue ?? "565.00";
  const creditBalanceTransfer = options.creditBalanceTransfer === undefined
    ? ""
    : `<SummaryBreakdown><Description>Credit Balance Transfer</Description><Amount>${options.creditBalanceTransfer}</Amount></SummaryBreakdown>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<xfa:datasets xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/">
  <xfa:data>
    <Bill>
      <BillHeader>
        <PersonalDetails><Date>2026/02/28</Date><Period>2026/02</Period></PersonalDetails>
        <InvoiceDetails><AccountNumber>999000222</AccountNumber></InvoiceDetails>
      </BillHeader>
      <Summary>
        <BillSummaryDetails>
          <TotalDue>${totalDue}</TotalDue>
          <SummaryBreakdown><Description>Previous Account Balance</Description><Amount>1,000.00</Amount></SummaryBreakdown>
          <SummaryBreakdown><Description>Less: Incoming Payment (Last Payment Made 2026/02/05)</Description><Amount>-500.00</Amount></SummaryBreakdown>
          <SummaryBreakdown><Description>Sub Total</Description><Amount>500.00</Amount></SummaryBreakdown>
          <SummaryBreakdown><Description>Interest on Arrears</Description><Amount>10.00</Amount></SummaryBreakdown>
          ${creditBalanceTransfer}
          <SummaryBreakdown><Description>Current Charges (Excl. VAT)</Description><Amount>90.00</Amount></SummaryBreakdown>
          <SummaryBreakdown><Description>VAT @ 15%</Description><Amount>15.00</Amount></SummaryBreakdown>
          <SummaryBreakdown><Description>Deposit Released</Description><Amount>-50.00</Amount></SummaryBreakdown>
        </BillSummaryDetails>
      </Summary>
      <Body>
        <CurrentCharges><TotalDue>${totalDue}</TotalDue></CurrentCharges>
        <CategoryType>
          <CategoryName>Water</CategoryName>
          <CategoryTable>
            <CategoryLineItem><ItemDescription>Service charge</ItemDescription><ItemAmount>100.00</ItemAmount></CategoryLineItem>
            <CategoryLineItem><ItemDescription>Service correction</ItemDescription><ItemAmount>-10.00</ItemAmount></CategoryLineItem>
            <CategoryLineItem><ItemDescription>VAT: 15.00%</ItemDescription><ItemAmount>${detailedVat}</ItemAmount></CategoryLineItem>
          </CategoryTable>
        </CategoryType>
      </Body>
    </Bill>
  </xfa:data>
</xfa:datasets>`;
}

function deflateXfaStream(xfaXml: string, finalByte?: number): Buffer {
  if (finalByte === undefined) {
    return deflateSync(Buffer.from(xfaXml, "utf8"));
  }

  for (let paddingLength = 0; paddingLength < 65_521; paddingLength += 1) {
    const candidate = deflateSync(Buffer.from(`${xfaXml}${" ".repeat(paddingLength)}`, "utf8"));
    if (candidate.at(-1) === finalByte) {
      return candidate;
    }
  }

  throw new Error(`Could not produce a synthetic XFA stream ending in byte ${finalByte}.`);
}

function adobeFormPlaceholderLines(): string[] {
  return [
    "Please wait...",
    "If this message is not eventually replaced by the proper contents of the document, your PDF viewer may not be able to display this type of document.",
    "This document requires Adobe Reader 8 or higher.",
    "For more assistance with Adobe forms, go to http://www.adobe.com/go/pdf_forms_configure.",
  ];
}

function escapePdfText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}
