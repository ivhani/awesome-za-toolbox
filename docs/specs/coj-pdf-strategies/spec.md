# COJ PDF Extraction Strategies Spec

## Objective

Replace the eJoburg parser's ordered text-to-XFA fallback with three independent peer extraction strategies for City of Johannesburg PDFs:

- standard PDF text extraction,
- XFA dataset extraction,
- layout-aware positioned text extraction for flattened LiveCycle/AEM tax invoices.

The public command remains:

```bash
za-toolbox municipal ejoburg parse <pdf> --format json|csv --output <path>
```

## Approved Behavior

- The normal single-file parse path runs all three strategies independently.
- Each strategy returns a standard result envelope with strategy identity, success or failure, optional parsed `MunicipalStatement`, warnings, errors, and provenance safe for review.
- A strategy is successful only when its parsed statement passes semantic validation. A schema-shaped result with missing required COJ balances or failed balance reconciliation is a failed strategy with coded diagnostics.
- The parser retains every per-strategy result in structured metadata.
- If successful strategies materially agree, the parser consolidates deterministically into the ordinary `MunicipalStatement` output.
- If only one strategy succeeds, the parser returns that statement and preserves other strategy failures as diagnostics.
- Failed peer strategies remain in metadata and do not create top-level warnings when the selected single-success statement is validated and reconciled.
- Top-level warnings are reserved for warnings from the selected strategy and failed final reconciliation checks; all-failed and disagreement remain structured failures requiring review.
- If successful strategies materially disagree, the parser marks the result for review and does not silently choose a winner.
- If every strategy fails, the parser returns a structured failure.
- The parser never invents missing values.
- Corrupted standard-text extraction must not outvote a coherent peer merely because it emitted line items.

## Layout-Aware Scope

The layout-aware strategy targets flattened COJ tax invoices where useful text is present as positioned page text but ordinary extraction can split headings and fields across awkward ordering. It must parse:

- split COJ tax-invoice headings,
- account, period, balance, payment, and amount-due fields,
- charge categories and category rows,
- VAT lines,
- reconciliation checks.

## XFA Summary Scope

The XFA strategy must preserve accounting adjustments that COJ stores in `SummaryBreakdown` rather than `CategoryLineItem` records:

- incoming payments are payments,
- interest on arrears is a balance charge,
- deposit releases are credits,
- summary VAT is used only when detailed category VAT is absent.

When detailed VAT is present, its rounded total must agree with summary VAT. The strategy must fail semantic validation instead of guessing when summary adjustments or VAT do not reconcile the statement. This behavior is isolated to XFA parsing; standard-text and layout-aware parsing remain unchanged.

## Boundaries

- No workbook or batch parsing behavior.
- No dependency on the local COJ workbook proof of concept.
- No Python, Poppler, OCR, cloud service, browser automation, portal access, or system-level runtime dependency.
- Node/npm dependencies are acceptable when they are production dependencies of the package that uses them.
- Real private PDFs, raw extracted private text, account numbers, addresses, names, balances, and transaction details must not be committed.
- Fixtures must be synthetic or sanitized.

## Acceptance Criteria

- Feature work is isolated in a clean worktree and branch based directly on latest `origin/main`.
- No workbook POC files or workbook dependencies appear in the diff.
- Tests exercise all three strategies independently with one or two representative documents or fixtures each.
- Tests cover consolidation agreement, single-success, all-fail, and disagreement/review behavior.
- A sanitized regression fixture covers split/corrupted VAT text and verifies that the malformed standard-text parse is rejected semantically.
- Sanitized XFA regressions cover summary payments, interest, deposit releases, detailed VAT deduplication, summary-only VAT fallback, and unreconciled XFA rejection.
- Existing standard text and XFA behavior remains passing.
- The layout-aware strategy extracts and parses selected local private PDFs without OCR or system dependencies.
- Local validation across the approved 20-account-PDF corpus produces usable consolidated statements, with any genuine review exceptions listed precisely.
- Local validation across the 47-document full-history corpus produces reconciled statements without regressing the approved 20-document flattened corpus.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, and production dependency audit pass.
- The implementation is committed, pushed, and opened as a focused pull request to `main`.
