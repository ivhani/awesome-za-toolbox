# COJ XFA Corpus Accuracy Spec

## Objective

Make the existing XFA strategy handle two deterministic variants found in a broad local COJ statement corpus without changing the CLI or workbook contract.

## Behavior

- Preserve a signed `Credit Balance Transfer` summary entry as a balance movement, not a municipal charge.
- Extract Flate-compressed XFA streams when the final compressed payload byte is `0x0D` and the PDF uses a lone line feed before `endstream`.
- Keep private statements and extracted private data outside Git.

## Acceptance Criteria

- Synthetic tests cover positive and negative credit-balance transfers.
- A synthetic compressed XFA stream ending in `0x0D` extracts successfully.
- Existing parser and workbook tests remain green.
- The local 139-file corpus produces reconciled rows except for genuinely unsupported inputs.
