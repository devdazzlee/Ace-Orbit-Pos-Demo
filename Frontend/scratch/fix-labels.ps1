$content = Get-Content "components\StockManagement.tsx" -Raw
$content = $content -replace 'Inventory Asset', 'Product'
$content = $content -replace '>Node<', '>Branch<'
$content = $content -replace '"Target Node"', '"Select Branch"'
$content = $content -replace 'Storage Node', 'Branch'
$content = $content -replace 'Node Location', 'Branch'
$content = $content -replace 'Cost Point', 'Cost Price'
$content = $content -replace '>Stock Registration<', '>Add Stock<'
$content = $content -replace '>Stock Disposal Protocol<', '>Remove Stock<'
$content = $content -replace '>Precision Adjustment<', '>Adjust Stock<'
$content = $content -replace '>Correction Category<', '>Reason<'
$content = $content -replace '>Disposal Reason<', '>Reason<'
$content = $content -replace '>Disposal Quantity<', '>Quantity to Remove<'
$content = $content -replace '>Asset for Disposal<', '>Product<'
$content = $content -replace '>Asset for Adjustment<', '>Product<'
$content = $content -replace 'Authorize Registration', 'Save Stock'
$content = $content -replace 'Export Ledger', 'Export'
$content = $content -replace "'> RECORD", "'> Add Stock"
$content = $content -replace 'No matching assets', 'No products found'
$content = $content -replace 'Procurement \& Log', 'Add new stock entry'
$content | Set-Content "components\StockManagement.tsx" -NoNewline
Write-Host "Done"
