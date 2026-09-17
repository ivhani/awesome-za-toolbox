# COJ PDF Extraction Strategies Analysis

## Existing State

- `parseEjoburgStatement` currently attempts standard PDF text parsing first and tries XFA only after text extraction fails or text parsing identifies an Adobe dynamic-form placeholder.
- `parseEjoburgStatementText` already handles simple eJoburg statement text and a normalized COJ tax-invoice text shape.
- `parseEjoburgStatementXfaDataset` parses the supported COJ `Bill` XFA dataset shape.
- `packages/pdf-utils` owns PDF text and XFA extraction.
- The CLI delegates to `parseEjoburgStatement`, so parser architecture changes can remain in packages.

## Decisions

- Strategy diagnostics will live in parser metadata to keep CLI JSON compatibility and avoid changing `MunicipalStatement`.
- Strategy provenance must contain strategy names, extraction mode, page counts or item counts, warning/error codes, and no raw source text.
- The public parser will keep returning `ParseResult<MunicipalStatement>`.
- Review-required disagreement will be a structured parse failure with strategy diagnostics, because returning a chosen statement would silently prefer one strategy.
- Synthetic fixtures will be generated in tests rather than committed as private PDF artifacts.

## Private Live Validation

Use at most the approved private January 2026 and March 2026 statements from the local 100 Jorissen eJoburg source folder.

Do not copy these PDFs into the repository. Do not commit raw extracted text or identifying contents. Verification evidence should record only whether local validation passed.

## Risks

- Positioned text extraction can vary across PDF producers and fonts.
- The layout-aware renderer must avoid overfitting to private line coordinates while still reproducing the observed split-heading shape in synthetic fixtures.
- Disagreement comparison should be strict enough to prevent silent data corruption but tolerant of row ordering and harmless statement field omissions.
