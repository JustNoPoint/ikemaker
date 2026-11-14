# Runtime and user-facing data at the root of data/. Internal audits, private
# work logs, captured screenshots and QA projects are deliberately outside it.
$dataFiles = @(
    'animation-standards.json', 'engine-capability-catalog.json', 'engine-consumer-coverage.json',
    'interface-capabilities.json', 'lua-api.json', 'reviewed-engine-artifacts.json', 'sctrl.json',
    'stage-def-catalog.json', 'test-catalog.json', 'triggers.json', 'workspace-setup-map.json',
    'CREDITS.md', 'IKeMeter-Integration.md', 'Production-Workflow-Guide.md',
    'sff-artist-guide.md', 'sff-standard.md', 'stage-screenpack-workspace-spec.md',
    'mobile-platform-feature-matrix.md', 'throw-authoring-and-live-preview-bridge.md',
    'User-Created-Palette-Standard.md', 'True-Color-In-Game-Color-Editor-Spec.md',
    'Workflow-Stabilization-Architecture.md', 'zss-learning-criteria.md'
)
$runtimeTrees = @(
    'src', 'media', 'snippets', 'syntaxes', 'bin',
    'data/authoring-bridge', 'data/emulator-cheats', 'data/help', 'data/luals',
    'data/offline-docs', 'data/sff-runtime-certification', 'data/workflow-blocks', 'data/workflow-profiles'
)
foreach ($name in $dataFiles) {
    Add-FileEntry (Join-Path $root "data/$name") "extension/data/$name"
}
foreach ($directory in $runtimeTrees) {
    $base = Join-Path $root $directory
    foreach ($file in Get-ChildItem -LiteralPath $base -File -Recurse) {
        $relative = $file.FullName.Substring($root.Length + 1).Replace('\', '/')
        Add-FileEntry $file.FullName "extension/$relative"
    }
}

# Meter verifies every listed file on launch. Keep the original approved hashes
# of its runtime subset; its acceptance fixtures and developer logs stay local.
$meterRoot = Join-Path $root 'companions/IKeMeter'
$meterFiles = @(Get-Content -LiteralPath (Join-Path $meterRoot 'SHA256SUMS.txt') | Where-Object {
    $_ -match '^[a-f0-9]{64}  (app/|bridge/|src/|package\.json$|Start-IKeMeter\.ps1$)'
})
foreach ($entry in $meterFiles) {
    $digest, $name = $entry -split '  ',2
    $file = Join-Path $meterRoot $name
    if ((Get-IkemakerFileSha256 $file) -ne $digest) { throw "IKeMeter runtime checksum mismatch: $name" }
    Add-FileEntry $file "extension/companions/IKeMeter/$name"
}
Add-TextEntry 'extension/companions/IKeMeter/SHA256SUMS.txt' (($meterFiles -join "`n") + "`n")
