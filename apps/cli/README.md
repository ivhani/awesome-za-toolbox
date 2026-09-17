# za-toolbox

Command-line interface for Awesome ZA Toolbox.

```bash
za-toolbox bank fnb parse statement.pdf --format json --output statement.json
za-toolbox municipal ejoburg parse invoice.pdf --format csv --output invoice.csv
za-toolbox municipal ejoburg workbook ./coj-statements --output tax-workbook.xlsx
za-toolbox dev extract-text statement.pdf --output extracted.txt
```

`dev extract-text` is intended for local inspection and anonymization only. Do not commit real extracted statement text.
