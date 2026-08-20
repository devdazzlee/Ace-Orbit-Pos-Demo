r\# Fix all inventory + customer pages — replace confusing jargon with plain POS language
$files = @(
    "components\inventory\purchases.tsx",
    "components\inventory\transfers.tsx",
    "components\inventory\stock-out.tsx",
    "components\inventory\stock-view.tsx",
    "components\inventory\stock-adjustment.tsx",
    "components\inventory\stock-movement-log.tsx",
    "components\inventory\inventory-reports.tsx",
    "components\inventory\inventory-audit.tsx",
    "components\customers.tsx",
    "components\sale-editor.tsx"
)

$replacements = @{
    # Jargon -> Plain English
    'Inventory Asset'       = 'Product'
    'Storage Node'          = 'Branch'
    'Node Location'         = 'Branch'
    'Node\>'                = 'Branch>'
    '"Target Node"'         = '"Select Branch"'
    'Cost Point'            = 'Cost Price'
    'Authorize Registration'= 'Save'
    'No matching assets'    = 'No products found'
    'Procurement '          = 'Stock '
    'procurement'           = 'purchase'
    'Neural Sync'           = 'Loading'
    'Global Domain'         = 'All Branches'
    'Synchronizing Inventory Network'  = 'Loading inventory data'
    'Secure Connection Established'    = ''
    'Fetching Real-time Analytics'     = ''
    'Real-time supply chain monitoring and asset valuation' = 'View stock levels, values and activity'
    'Revised Total'         = 'New Total'
    'Inventory Item'        = 'Product'
    'Discard Edits'         = 'Cancel'
    'Active Transfers'      = 'Transfers'
    'MANAGE STOCK'          = 'Manage Stock'
    'FULL AUDIT'            = 'View All'
    'Recent Lifecycle'      = 'Recent Purchases'
    'Critical action required' = 'Needs restocking'
    'Active product domain' = 'Active products'
    'Catalog Size'          = 'Total Products'
    'Inventory Health'      = 'Stock Health'
}

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        foreach ($key in $replacements.Keys) {
            $content = $content -replace $key, $replacements[$key]
        }
        $content | Set-Content $file -NoNewline
        Write-Host "Fixed: $file"
    } else {
        Write-Host "SKIP (not found): $file"
    }
}

Write-Host "All done!"
