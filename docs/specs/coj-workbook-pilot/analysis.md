# COJ Workbook Pilot Analysis

## Requirement coverage

All approved decisions map directly to the specification: COJ first, folder batch input, one stable sheet, year and month columns, agreed tax categories, continue-on-error behavior, create-or-update workbook handling, atomic replacement, and no deduplication or line-item sheet.

## Key risks

- Category wording varies across statement layouts. The pilot uses transparent description matching and routes unmatched values to `Other charges` rather than dropping them.
- Some eJoburg PDFs are Adobe dynamic forms. They remain unsupported by the current extractor and appear as review rows.
- Excel libraries do not preserve every advanced workbook feature. The pilot targets ordinary `.xlsx` workbooks and verifies that unrelated worksheets survive a round trip. Macro-enabled files are out of scope.
- An existing `COJ` sheet would create an ambiguous update. The approved pilot assumes it does not exist.

## Decision

The requirements are internally consistent and can be implemented without changing existing parser contracts. Proceed with the additive workbook package and CLI command.
