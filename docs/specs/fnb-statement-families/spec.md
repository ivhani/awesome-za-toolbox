# FNB Statement-Family Parsing Spec

## Objective

Replace the FNB parser's mixed ordered transaction-parser chain with an extensible statement-family architecture. The normal CLI path must identify an FNB statement family before it runs any family-specific extraction strategy.

The public command remains:

```bash
za-toolbox bank fnb parse <pdf> --format json|csv --output <path>
```

The public parser continues to return `ParseResult<BankStatement>`.

## Supported Families And Layouts

- `personal-current-account`
  - `pipe-v1`: the existing simple, pipe-delimited statement shape used by the public synthetic PDF path.
  - `standard-columns-v1`: date, description, amount, balance, and optional reference columns separated by whitespace.
  - `compact-tax-invoice-v1`: FNB compact extracted text with statement balances, `Transactions in RAND (ZAR)`, dates without a year, and adjacent amount/balance columns.
- `business-account`
  - `compact-tax-invoice-v1`: the observed FNB business-account compact layout, including separate accrued-bank-charge rows.
- `home-loan`
  - `transaction-history-v1`: dated home-loan history rows with debit balances and amount inference from coherent running balances.

`credit-card` is a known detectable family but is not an extraction-supported family in this change because no representative credit-card statement was supplied. A detected credit-card statement must return a structured unsupported-layout failure.

## Approved Behavior

- Family detection is a separate module from extraction strategies.
- Detection returns a family only when exactly one family has explicit marker evidence.
- Zero detected families returns a structured undetected-family failure.
- Multiple detected families returns a structured ambiguous-family failure and runs no extraction strategy.
- After detection, every registered strategy for that family evaluates its own applicability evidence independently.
- An applicable strategy either returns a fully reconciled `BankStatement` or a structured failure. It must not return a guessed partial statement.
- A successful strategy requires coherent period, opening balance, closing balance, at least one transaction, statement-balance reconciliation, and running-balance reconciliation.
- Non-transaction material may produce a warning. A date-shaped row that cannot be parsed is a strategy failure.
- If exactly one strategy succeeds, its statement is returned.
- If multiple successful strategies materially agree, one deterministic result is returned and every strategy result remains in metadata.
- If multiple successful strategies materially disagree, no winner is selected. The parser returns a structured review-required failure with sanitized diagnostics.
- Inapplicable and failed strategies remain visible in metadata but do not become top-level warnings on a valid reconciled result.
- Provenance contains family, strategy, version, extraction mode, page/line counts, evidence codes, warning codes, and error codes. It contains no raw statement text or extracted private values.

## Contract And Schema

- `BankStatement`, `BankTransaction`, and the shared `ParseResult<T>` shape do not change.
- FNB adds parser-specific metadata fields for family detection, strategy diagnostics, and consolidation. Existing callers that only use shared metadata remain compatible.
- CSV and JSON CLI behavior remains unchanged. JSON naturally includes the additional metadata.

## Private Validation Boundary

The supplied private corpus contains six local artefacts representing three layouts:

- personal/current compact layout: one PDF and one extracted-text copy;
- business compact layout: one PDF and one extracted-text copy;
- home-loan transaction-history layout: one PDF and one extracted-text copy.

The private artefacts may be read locally for validation only. They must not be copied into Git, quoted in documentation, or used to key behavior to names, account numbers, dates, filenames, or transaction particulars.

## Non-Goals

- Credit-card transaction extraction without a representative source document.
- Private workbook or batch proof-of-concept behavior.
- OCR, portal access, browser automation, cloud processing, or telemetry.
- Account-holder-specific or filename-specific parser rules.
- Changes to package versions or release configuration.

## Acceptance Criteria

- Work is isolated in a clean worktree and feature branch from current `origin/main`.
- Family detection runs before family-specific extraction and is directly tested.
- Each supported family/layout has an explicit strategy with applicability evidence and sanitized provenance.
- Synthetic tests cover every supported family/layout plus undetected, ambiguous-family, unsupported credit-card, all-failed, material-disagreement, malformed-row, and reconciliation-failure outcomes.
- The three supplied private PDFs parse to the expected family/layout, pass statement and running-balance reconciliation, and require no review.
- No private artefact or private value is added to Git.
- Existing CLI syntax and `ParseResult<BankStatement>` behavior remain compatible.
- `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm audit --prod` pass.
- One focused pull request is opened to `main`; no merge or release is performed.
