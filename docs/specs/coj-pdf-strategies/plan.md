# COJ PDF Extraction Strategies Plan

## Design

1. Add safe, local layout extraction to `packages/pdf-utils`.
   - Use a Node/npm PDF engine to read page text items and their coordinates.
   - Return normalized per-page text items and a line-oriented layout rendering.
   - Keep standard text extraction and XFA extraction available as separate utilities.

2. Add an internal strategy layer to `packages/ejoburg`.
   - Define `EjoburgParseStrategy` and `EjoburgStrategyResult`.
   - Implement independent standard-text, XFA-dataset, and layout-aware strategies.
   - Ensure each strategy catches ordinary parse failures and returns a structured result.

3. Add deterministic consolidation.
   - Validate each parsed statement before it enters consolidation, including required COJ balance fields and balance reconciliation.
   - Convert semantic validation failures into ordinary failed-strategy diagnostics.
   - Keep expected failed-peer diagnostics in strategy metadata instead of promoting them to top-level warnings on a valid single-success result.
   - Compare successful strategy statements on core fields and rounded totals.
   - Return a normal `ParseResult<MunicipalStatement>` when there is one success or all successes agree.
   - Return a structured review-required failure when successful statements materially disagree.
   - Attach strategy diagnostics and consolidation status to metadata.

4. Extend COJ tax-invoice parsing for layout-aware output.
   - Parse synthetic positioned text that reproduces observed split headings and rows.
   - Reuse common COJ line parsing where the layout renderer can create normalized lines.
   - Add focused warnings and reconciliation checks without exposing source text.

5. Verify against synthetic fixtures and selected private PDFs.
   - Commit only synthetic fixture generators and tests.
   - Run live validation from the private source paths, including the approved 20-PDF account corpus, and record only non-identifying pass/fail evidence.
   - Configure the bundled pdf.js standard-font path if it can be resolved portably in Node.

## Non-Goals

- Workbook parsing, workbook dependencies, and batch workflows.
- General OCR or scanned statement support.
- A public CLI flag for choosing strategies.
- Persisting private extraction output.
