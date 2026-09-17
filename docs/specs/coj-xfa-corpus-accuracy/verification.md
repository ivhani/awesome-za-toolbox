# COJ XFA Corpus Accuracy Verification

## Automated Checks

- `pnpm typecheck`: passed.
- `pnpm test`: passed, 38 of 38 tests.
- `pnpm build`: passed for all workspace packages.
- `pnpm audit --prod`: passed with no known vulnerabilities.

## Local Corpus

- Input: 139 private COJ PDFs across six accounts; no source files were committed.
- Parsed statements: 139 of 139.
- Workbook rows marked `OK`: 139.
- Rows requiring review: 0.
- Category spot checks confirmed water, electricity, property rates, refuse, payments, and legitimate other-charge values remain separated.
