param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$OutputArchive
)

$ErrorActionPreference = 'Stop'
$source = [System.IO.Path]::GetFullPath($SourceDirectory)
$output = [System.IO.Path]::GetFullPath($OutputArchive)

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
    throw "Public release directory does not exist: $source"
}
if (Test-Path -LiteralPath $output) {
    throw "Release archive already exists: $output"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($output)) | Out-Null

# CreateFromDirectory includes dot-prefixed/hidden development-safe files that
# Compress-Archive can silently omit. The false flag keeps game files at the
# archive root instead of adding an extra parent directory.
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $source,
    $output,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
)

Write-Output $output
