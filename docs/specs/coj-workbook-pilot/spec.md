# COJ Workbook Pilot

## Objective

Add a local-first CLI workflow that processes a folder of City of Johannesburg municipal statement PDFs into one Excel workbook for tax preparation.

## User workflow

```text
za-toolbox municipal ejoburg workbook <folder> --output <workbook.xlsx>
```

- If the workbook does not exist, create it.
- If the workbook exists, preserve its existing sheets and add a sheet named `COJ`.
- Build and validate the workbook through a temporary file, then replace the destination only after a successful write.
- Process every PDF in the input folder even when an individual file cannot be parsed.

## COJ sheet

The sheet contains one row per source statement or failed source file, sorted by statement period and then source filename.

Columns:

1. Year
2. Month
3. Water
4. Electricity
5. Rates and taxes
6. Sewerage
7. Refuse
8. Other charges
9. Payments
10. Opening balance
11. Closing balance
12. Source filename
13. Review status

Amounts are numeric ZAR values. Year and month come from the parsed billing period, not the filename. Charge totals include matching VAT line items in the same category. Payments retain the parser's signed values.

`Review status` is `OK` only when parsing succeeds without warnings and all parser checks pass. Otherwise it contains concise warning, failed-check, or parse-error information. Failed files have blank period and amount fields.

## Charge categories

Descriptions are matched case-insensitively:

- Water: descriptions containing `water`
- Electricity: descriptions containing `electricity`, `electric`, or `power`
- Rates and taxes: descriptions containing `property rates`, `rates and taxes`, or `rates`
- Sewerage: descriptions containing `sewerage`, `sewer`, or `sanitation`
- Refuse: descriptions containing `refuse`, `pikitup`, or `waste`
- Other charges: every unmatched charge

## Boundaries

- PDF files in the immediate input folder only; no recursive traversal.
- Detailed line items remain available from the parser but are not written to the workbook.
- No duplicate detection or merging with existing COJ data.
- Sheet-name collisions are outside the pilot; the command assumes `COJ` does not already exist.
- No portal access, scraping, credential storage, telemetry, cloud upload, or AI processing.

## Acceptance criteria

- A folder with multiple valid COJ PDFs produces one `COJ` row per statement.
- Category totals, payments, balances, period, filename, and review status are correct.
- A bad or unsupported PDF produces a review row and does not prevent valid statements from being written.
- A missing destination workbook is created.
- An existing workbook retains all existing sheets and gains the `COJ` sheet.
- A failed write does not leave a partial destination workbook.
- CLI help and repository usage documentation describe the command.
- Typecheck, tests, and build pass with synthetic or anonymized fixtures only.
