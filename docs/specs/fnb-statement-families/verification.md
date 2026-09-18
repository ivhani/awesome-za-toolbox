# FNB Statement-Family Parsing Verification

## Automated Verification

- `pnpm typecheck` passed.
- `pnpm test` passed: 43 tests, 43 passing.
- `pnpm build` passed for all workspace packages.
- `pnpm audit --prod` passed with no known vulnerabilities.
- The frozen lockfile passed the repository's supply-chain policy during install.

Focused FNB coverage includes:

- detection for personal/current, business, home-loan, and credit-card families;
- `pipe-v1`, `standard-columns-v1`, personal/current compact, business compact, and home-loan transaction-history extraction;
- explicit applicability evidence and version provenance;
- undetected and ambiguous family failures before extraction;
- detected-but-unsupported credit-card handling;
- malformed dated-row rejection;
- reconciliation rejection;
- agreeing-strategy consolidation and materially disagreeing review outcomes.

## Private Local Validation

The three supplied private PDFs were validated locally without copying or committing them:

- personal/current compact PDF: detected as `personal-current-account`, selected `personal-current-compact-tax-invoice-v1`, no warnings, no review, all four semantic/reconciliation checks passed;
- business compact PDF: detected as `business-account`, selected `business-compact-tax-invoice-v1`, no warnings, no review, all four semantic/reconciliation checks passed;
- home-loan PDF: detected as `home-loan`, selected `home-loan-transaction-history-v1`, no warnings, no review, all four semantic/reconciliation checks passed.

The matching three extracted-text copies produced the same family/layout classifications during baseline assessment.

## Scope And Privacy Check

- No private PDF or extracted private text was added to Git.
- No account-specific, person-specific, filename-specific, date-specific, balance-specific, or transaction-specific rule was added.
- No private workbook or batch proof-of-concept code is present.
- The CLI command and `ParseResult<BankStatement>` contract are unchanged.
- The shared `BankStatement` schema is unchanged; parser-specific diagnostics are additive metadata.

## Remaining Limitation

Credit-card extraction remains intentionally unsupported because the supplied corpus has no representative FNB credit-card statement. The detector recognizes explicit credit-card family evidence and returns `FNB_LAYOUT_UNSUPPORTED`. Safe extraction work needs at least one representative text-based FNB credit-card PDF, preferably plus a second issue-date/layout variant.

No private PDF, extracted private text, account identifier, customer name, address, balance, transaction, or filename-derived rule may be recorded here.
