function Get-IkemakerReleaseDirectory([string]$SourceRoot) {
    $current = [IO.Path]::GetFullPath($SourceRoot)
    while ($current) {
        $marker = Join-Path $current '.ikemaker-workspace.json'
        if (Test-Path -LiteralPath $marker) {
            $layout = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
            $destination = [IO.Path]::GetFullPath((Join-Path $current $layout.releaseDirectory))
            if (-not $destination.StartsWith($current.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Release directory must remain inside its workspace.' }
            return $destination
        }
        $parent = Split-Path -Parent $current
        if ($parent -eq $current) { break }
        $current = $parent
    }
    return Join-Path (Split-Path -Parent $SourceRoot) 'releases'
}
