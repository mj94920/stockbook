# Run on the HOME development PC. Includes only the five requested source files.
# Does not include auth.json, credentials, runtime config, chat logs, assets, or keys.
$ErrorActionPreference = 'Stop'
$homeRepo = 'C:\Users\mj949\I-Character-Project-home-github-stable-20261101'
$sourceFiles = @(
    'desktop-pet\src\engine\codex-adapter.js',
    'desktop-pet\src\engine\claude-adapter.js',
    'desktop-pet\src\engine\runtime.js',
    'desktop-pet\src\engine\auth.js',
    'desktop-pet\shell\electron\main.cjs'
) | ForEach-Object { Join-Path $homeRepo $_ }
foreach ($sourceFile in $sourceFiles) {
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { throw "Missing source file: $sourceFile" }
}
$sourceZip = Join-Path $env:TEMP ('HOME-StockBook-sources-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')
Compress-Archive -LiteralPath $sourceFiles -DestinationPath $sourceZip
Write-Output $sourceZip
