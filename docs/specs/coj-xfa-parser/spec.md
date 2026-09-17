# COJ XFA Parser Integration Spec

## Objective

Integrate deterministic City of Johannesburg XFA statement handling into the normal eJoburg parser path used by:

```bash
za-toolbox municipal ejoburg parse <pdf> --format json|csv --output <path>
```

Ordinary embedded-text parsing remains the default. If the PDF is a valid COJ Adobe dynamic form with an embedded XFA dataset, the parser must extract the dataset locally and return the same `ParseResult<MunicipalStatement>` contract as text-based statements.

## Boundaries

- No OCR, AI, cloud upload, portal access, scraping, credentials, or browser automation.
- No runtime dependency on 100 Jorissen paths, scripts, data, or code.
- Real statements, private extracted text, account details, addresses, names, balances, and other private data must not be committed.
- Fixtures and tests must use synthetic or anonymized XFA content only.
- Changes to downstream consumers of `parseEjoburgStatement` are not in scope.

## Behavior

- `parseEjoburgStatement` first attempts existing PDF text extraction and text parsing.
- If text parsing succeeds, XFA handling is not used.
- If the extracted text is the Adobe dynamic-form placeholder, or no embedded text is available, the parser attempts local XFA dataset extraction.
- A supported XFA dataset must produce a normalized `MunicipalStatement`:
  - `municipality`: `City of Johannesburg`
  - `accountNumber`: invoice account number when present
  - `billingPeriod`: inferred from the statement period or statement date
  - `openingBalance`: prior/outstanding balance when present
  - `closingBalance`: total due/outstanding when present
  - `charges`: non-zero category line items and optional VAT/current-charge summary rows
  - `payments`: payment/credit line items represented as negative values
- Balance reconciliation uses the existing `municipal-balance-reconciliation` check.
- Unsupported or malformed XFA inputs return structured parser failures through the existing `ParseResult` error contract.

## Acceptance Criteria

- Existing text-PDF parser tests still pass unchanged.
- CLI syntax remains unchanged.
- Synthetic XFA PDF tests cover:
  - XFA dataset detection and extraction from a compressed PDF stream.
  - Field extraction into `MunicipalStatement`.
  - Charge and payment normalization.
  - Reconciliation pass/fail behavior.
  - Structured failure for malformed or unsupported XFA documents.
- Verification evidence records:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
  - Production dependency audit

## Known Limitations

- This feature supports COJ XFA datasets shaped around a `Bill` element with `BillHeader`, `Summary`, `Body`, `CategoryType`, and `CategoryLineItem` sections.
- Other COJ PDF layouts that are neither text-extractable nor shaped like this XFA dataset remain structured parse failures.
