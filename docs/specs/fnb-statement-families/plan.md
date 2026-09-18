# FNB Statement-Family Parsing Plan

## Design

1. Introduce a family-detection module.
   - Register explicit detectors for personal/current, business, home-loan, and credit-card statements.
   - Emit stable evidence codes rather than raw matching text.
   - Require exactly one detected family before extraction proceeds.

2. Introduce a deep strategy module behind the existing parser interface.
   - Define one small internal strategy interface: identity, family, version, applicability, and parse.
   - Register independent adapters for each supported family/layout.
   - Share low-level date, money, and reconciliation helpers inside the implementation without exposing them to callers.

3. Gate strategy success on coherent evidence.
   - Require layout-specific applicability markers.
   - Treat unparsed date-shaped rows as failures.
   - Require opening/closing balances, transactions, statement reconciliation, and running-balance reconciliation.

4. Add deterministic consolidation.
   - Preserve all strategy outcomes and sanitized provenance in metadata.
   - Return a normal result for one successful strategy or materially agreeing successes.
   - Return structured all-failed or review-required disagreement outcomes without selecting a permissive fallback.

5. Preserve compatibility.
   - Keep `parse`, `parseFnbStatement`, and `parseFnbStatementText` entry points.
   - Keep `BankStatement` and shared `ParseResult<T>` unchanged.
   - Keep the CLI thin and unchanged.

6. Verify with synthetic and private inputs.
   - Expand synthetic fixtures/tests for all supported versions and failure policies.
   - Validate only sanitized summaries against the three supplied private PDFs.
   - Run repository typecheck, tests, build, and production dependency audit.

## Deep-Module Shape

The external seam remains `parseFnbStatement(input): Promise<ParseResult<BankStatement>>`. Detection, strategy selection, layout parsing, reconciliation, and uncertainty handling stay behind that small interface. The strategy registry is an internal seam justified by multiple real family/version adapters.

## Non-Goals

- A public strategy-selection flag.
- A generic heuristic strategy that votes across unrelated families.
- A fallback that chooses the first statement-shaped parse.
- Credit-card extraction before representative evidence exists.
