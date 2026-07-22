# Contributing

Awesome ZA Toolbox handles financial and municipal documents. Treat every sample, log, issue, and screenshot as sensitive by default.

## Safety rules

- Do not commit real bank statements, municipal statements, invoices, IDs, proof-of-address documents, credentials, cookies, session files, or screenshots containing personal information.
- Do not paste real account numbers, card numbers, addresses, names, emails, phone numbers, meter numbers, references, balances, or transaction descriptions into issues or pull requests.
- Use synthetic fixtures whenever possible.
- If a real document is needed for parser work, anonymize it first and keep the original outside the repository.
- Local PDFs used during development belong under `fixtures/private/`, which is git-ignored.
- Commit only sanitized text fixtures or expected parser outputs after checking that no personal information remains.

## Parser contributions

Parser changes should include focused tests and should preserve the normalized schema exposed by the CLI. Prefer returning warnings and reconciliation checks over silently guessing when a layout is only partially understood.

## Local fixture workflow

```bash
mkdir -p fixtures/private/extracted
pnpm --filter za-toolbox start -- dev extract-text fixtures/private/fnb-sample-1.pdf --output fixtures/private/extracted/fnb-sample-1.txt
```

Review and anonymize the extracted text before using it as a committed fixture.
