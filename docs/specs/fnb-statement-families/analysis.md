# FNB Statement-Family Parsing Analysis

## Existing State On `origin/main`

- `packages/fnb/src/index.ts` owns PDF text extraction, statement-field extraction, transaction parsing, and reconciliation in one module.
- `parseTransaction` tries pipe, home-loan, compact-current, and whitespace handlers in a fixed mixed-family order.
- There is no statement-family result, layout/version identity, applicability evidence, or per-strategy provenance.
- Home-loan and compact current/business behavior is already present, but the family-specific knowledge is implicit inside transaction-line functions.
- Skipped rows become warnings and failed reconciliation lowers confidence, but the parser can still return `ok: true`.
- The CLI correctly delegates to `@awesome-za/fnb`; no CLI parsing logic needs to move.
- The shared schema already represents every currently supported family, so a schema change is unnecessary.

## Baseline Verification

- The repository baseline test suite passed: 35 tests.
- The supplied private corpus contains three distinct family/layout pairs, each represented by a PDF and extracted text.
- Current main parsed all three PDFs and all three text copies with no parser warnings.
- Each baseline result passed both statement-total and running-balance reconciliation.
- No credit-card representative is present.

## Decisions

- Detection is its own module and completes before the family strategy registry is consulted.
- Detection evidence is represented by stable marker codes and counts; raw matched text is never stored in metadata.
- The strategy interface is internal. Public callers continue to learn only the existing parser interface.
- Personal/current synthetic compatibility is represented by explicit `pipe-v1` and `standard-columns-v1` strategies rather than an unlabelled fallback.
- Compact personal/current and business layouts use separate strategy identities even where low-level parsing helpers are shared.
- Credit-card detection is implemented now, but extraction is intentionally absent until a representative document is available.
- Reconciliation is a success gate, not a warning-only quality signal.
- Material comparison includes institution, masked account identifier, period, balances, and normalized ordered transactions.
- Strategy disagreement is an `ok: false` review outcome; it never silently selects the registry's first success.

## Risks

- Product names evolve. Detectors therefore combine family labels with structural statement markers and expose their evidence for iterative extension.
- PDF text order can change between producers. Each new observed version should become a new explicit strategy rather than broadening an existing strategy until it accepts unrelated shapes.
- Amount inference from running balances is safe only when the complete statement reconciles; the semantic gate enforces that invariant.
- Existing loose fixtures may contain harmless non-transaction text inside the transaction section. Non-date lines can remain warnings, while unparsed date-shaped rows fail.

## Missing Representative Evidence

Credit-card extraction needs at least one representative text-based FNB credit-card PDF (and preferably a second statement from a different issue date/version). Until supplied, the parser will identify credit-card family markers and return an honest unsupported-layout result.
