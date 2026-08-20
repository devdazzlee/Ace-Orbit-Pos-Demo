$filePath = "c:\Users\Lenovo\Documents\Manpasand-Pos-\Frontend\components\StockManagement.tsx"
$content = Get-Content $filePath

# We need to INSERT line 467 instead of REPLACING it? No, I'll just restore the Button tag.
$newContent = @()
for ($i = 0; $i -lt $content.Length; $i++) {
    if ($i -eq 465) {
        $newContent += '        <div className="flex flex-col md:flex-row items-center gap-3">'
        $newContent += '           <div className="flex items-center gap-2">'
        # We need to keep the Button tag which was at 466 in original
        $newContent += '              <Button'
    } elseif ($i -eq 466) {
        # Skip original 466 which was "<Button" because we added it above
    } elseif ($i -eq 482) {
        $newContent += '              <Button variant="outline" size="icon" onClick={() => { refreshAllData(); triggerGlobalRefresh(); }} disabled={isLoading || globalLoading} className="rounded-xl h-11 w-11 border-slate-200 bg-white shadow-sm flex-shrink-0">'
    } elseif ($i -eq 484) {
        $newContent += '              </Button>'
    } elseif ($i -eq 485) {
        $newContent += '           </div>'
        $newContent += '           <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-sm gap-1 h-11">'
    } else {
        $newContent += $content[$i]
    }
}

$newContent | Set-Content $filePath -Encoding utf8
