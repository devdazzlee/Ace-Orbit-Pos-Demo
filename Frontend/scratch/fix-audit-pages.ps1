$files = @(
    "components\inventory\stock-out.tsx",
    "components\inventory\stock-movement-log.tsx",
    "components\inventory\inventory-audit.tsx"
)

$replacements = @{
    # Headings & Subtitles
    'Dispatch Engine' = 'Dispatched Stock'
    'Outbound inventory management \& Stock-Out manifests' = 'View and manage stock leaving branches'
    'Enterprise Audit Log' = 'Stock Movement Log'
    'Immutable Stock Movement \& Traceability Ledger' = 'Detailed history of stock changes'
    'Inventory Financial Audit' = 'Stock Profit Report'
    'Enterprise Intelligence \& Profitability Analysis' = 'Revenue, cost, and profit analysis'
    
    # Grid/KPI Labels
    'STOCK INBOUND' = 'Stock In'
    'STOCK OUTBOUND' = 'Stock Out'
    'NET FLUX' = 'Net Change'
    'RECEIVING ACTIVITY' = 'Received'
    'DISPELLING ACTIVITY' = 'Removed'
    'ACTIVITY LOGGED' = 'Records'
    'HISTORICAL TRACE' = 'History'
    'CURRENT FLOW TREND' = 'Current Trend'
    'GROSS REVENUE' = 'Total Sales'
    'COGS \(TOTAL COST\)' = 'Stock Cost'
    'Inventory Consumption Value' = 'Total value of stock used'
    'GROSS PROFIT' = 'Total Profit'
    'PROFIT MARGIN' = 'Profit %'
    'NET EARNINGS' = 'Net Profit'
    
    # Table & Form Labels
    'Core Asset' = 'Product'
    'Unit Flux \(Delta\)' = 'Quantity Change'
    'Location Node' = 'Branch'
    'Operational' = 'Active'
    'Branch Detail' = 'Branch Name'
    'Inventory Cost' = 'Cost Price'
    'Actual Profit' = 'Profit'
    'Audit Intelligence Filters' = 'Report Filters'
    'Asset Category Cluster' = 'Category'
    'Identity Filter \(Product/SKU\)' = 'Search Product'
    'Operational Period' = 'Select Dates'
    'Apply Neural Filters' = 'Apply Filters'
    'Focus Activity' = 'Activity Type'
    'Asset Traceability' = 'Search Product'
    'Sync Ledger' = 'Refresh'
    
    # Jargon / Messages
    'Synchronizing Audit Trail...' = 'Loading history...'
    'Establishing Secure Socket · Retrieving Immutable Ledger Logs' = 'Retrieving stock records...'
    'Processing Business Intelligence' = 'Loading reports...'
    'Running Financial Audit Algorithms · Verifying Branch Margins' = 'Analyzing financial data...'
    'Generating Neural Report...' = 'Generating report...'
    'Aggregating Cross-Branch Ledger Data' = 'Fetching branch data...'
    'Immutable Proof Required' = 'No records found'
    'Adjust sequence filters to reveal historical ledger logs' = 'Try changing your filters or dates.'
    'Compliance Node' = 'System Node'
    'Root System Cluster' = 'Main System'
    'Neural Warehouse' = 'Warehouse'
    'Ledger Synchronized' = 'Data Updated'
    'Audit Insights' = 'Summary'
    'AI Assisted' = 'Calculated'
    'Profitability Lead' = 'Profit Trend'
    'Supply Chain Health' = 'Stock Status'
    'Total System Valuation' = 'Total Stock Value'
    'Aggregate Value of Current Assets' = 'Total value of all items in stock'
    'Neural Filters' = 'Filters'
    
    # Styling Fixes (Regex)
    'uppercase tracking-tighter italic' = 'tracking-tight'
    'uppercase tracking-tight italic' = 'tracking-tight'
    'uppercase tracking-widest italic' = 'tracking-tight'
    'uppercase italic' = ''
    'font-black italic' = 'font-bold'
    'font-black uppercase' = 'font-bold'
}

foreach ($file in $files) {
    if (Test-Path $file) {
        $content = Get-Content $file -Raw
        foreach ($key in $replacements.Keys) {
            $content = $content -replace $key, $replacements[$key]
        }
        
        # Specific fixes for JSX tags where replacing just the string isn't enough
        $content = $content -replace 'font-black text-slate-900 uppercase tracking-tighter italic', 'font-bold text-slate-900 tracking-tight'
        $content = $content -replace 'font-black text-slate-900 tracking-tight uppercase italic', 'font-bold text-slate-900 tracking-tight'
        
        $content | Set-Content $file -NoNewline
        Write-Host "Fixed: $file"
    }
}
