# COJ Workbook Pilot Plan

## Architecture

Create `@awesome-za/workbooks` as a private reusable package. It will depend on the existing eJoburg parser and an Excel workbook library. The package will expose an SDK-style function that accepts an input directory and workbook path and returns a structured batch result.

The CLI will recognize `municipal ejoburg workbook`, require `--output`, call the package, print per-file warnings to stderr, and exit successfully when the workbook is written even if some source files require review.

## Delivery sequence

1. Add shared COJ workbook result types and category aggregation.
2. Discover immediate-child PDFs deterministically.
3. Parse each file independently and create summary or review rows.
4. Load or create the destination workbook, preserve existing sheets, and add a styled `COJ` worksheet.
5. Write to a sibling temporary file and atomically replace the destination after validation.
6. Add CLI routing and help text.
7. Add unit and CLI tests using generated PDFs and generated workbooks.
8. Update usage documentation and run the full verification suite.

## Workbook presentation

- One focused sheet named `COJ`.
- Dark header row with white text, frozen header, autofilter, and hidden gridlines.
- Numeric values stored as numbers with a ZAR-compatible two-decimal format.
- Review rows highlighted only when attention is required.
- Practical column widths with wrapped review text.

## Rollback

The change is additive. Rollback removes the workbook package, CLI command, tests, and documentation. Existing parse commands and schemas remain unchanged.

## Verification

- Unit tests for category mapping, warning/error rows, sorting, and workbook creation.
- Test updating an existing workbook while preserving an unrelated sheet.
- CLI test for folder-to-workbook execution.
- Open the generated workbook programmatically and inspect sheet names, values, number formats, panes, and filters.
- Run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
