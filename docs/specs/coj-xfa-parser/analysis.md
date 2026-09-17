# COJ XFA Parser Analysis

## Existing State

- `packages/ejoburg` already exposes `parse(input)` and `parseEjoburgStatement(input)` returning `ParseResult<MunicipalStatement>`.
- The CLI already delegates `municipal ejoburg parse` to `parseEjoburgStatement`; no CLI parser duplication is needed.
- The current parser detects Adobe dynamic-form placeholder text but reports it as unsupported.
- `packages/pdf-utils` already owns local PDF byte/text extraction and is the natural home for embedded XFA dataset extraction.

## Reference Review

The 100 Jorissen extractor was reviewed only as a behavioral reference. It demonstrated that supported COJ dynamic-form PDFs can contain a compressed XML dataset with a `Bill` element. This implementation must be independent TypeScript code in `awesome-za-toolbox`; no 100 Jorissen paths, code, or private data are used at runtime or in tests.

## Risk Notes

- XFA structures can vary. The first supported shape is the known COJ `Bill` shape with summary, header, and category line-item sections.
- A lightweight XML extraction approach is acceptable for this constrained dataset shape, but unsupported nesting or renamed fields should fail clearly rather than guessing.
- Text PDFs must remain first-class and must not pay an XFA parsing cost unless text parsing identifies an XFA-style failure.

## Verification Evidence

- `pnpm typecheck` passed.
- `pnpm test` passed: 23 tests, 23 passing.
- `pnpm build` passed.
- `pnpm audit --prod` passed with no known vulnerabilities.

## Implementation Outcome

- `packages/pdf-utils` now exposes local embedded XFA dataset extraction from PDF streams, including Flate-compressed streams.
- `packages/ejoburg` keeps text parsing as the first path and attempts XFA only for Adobe dynamic-form placeholder text or missing extractable PDF text.
- Supported XFA `Bill` datasets are normalized to `MunicipalStatement`, including account number, billing period, balances, charges, payments, parser checks, warnings, and structured errors.
- The CLI required no syntax or parser logic changes; `municipal ejoburg parse` inherits XFA support through `parseEjoburgStatement`.

## Remaining Layout Limitations

- The parser supports COJ XFA datasets shaped around a `Bill` element with `BillHeader`, `Summary`, `Body`, `CategoryType`, and `CategoryLineItem` sections.
- XFA files with renamed fields, deeply different nesting, or no embedded dataset return structured parse failures.
- The implementation remains deterministic and local-only; it does not attempt OCR or visual reconstruction for flattened or scanned statements.
