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

function Assert-IkemakerLuaCompanion([string]$Source) {
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf) -or
        (Get-Item -LiteralPath $Source).Length -ne 11080310 -or
        (Get-IkemakerFileSha256 $Source) -ne 'C0A7489AD58358DDF2590F6782C94FA9308076B73AAA30B456932373B0D8CB28') {
        throw 'Supply the reviewed Windows x64 Lua Language Server 3.19.1 VSIX listed in SOURCE-BUILD.md.'
    }
}

function Get-IkemakerFileSha256([string]$Source) {
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($Source)
    try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}
