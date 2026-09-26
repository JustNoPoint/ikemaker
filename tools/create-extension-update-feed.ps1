param(
    [Parameter(Mandatory=$true)][string]$VsixPath,
    [Parameter(Mandatory=$true)][string]$PackageUrl,
    [Parameter(Mandatory=$true)][string]$OutputPath,
    [string]$Channel = 'beta',
    [string]$MinEditorVersion = '1.85.0',
    [string[]]$Notes = @()
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json
$asset = [Uri]$PackageUrl
if ($asset.Scheme -ne 'https' -or -not [string]::IsNullOrEmpty($asset.UserInfo)) { throw 'PackageUrl must be HTTPS without embedded credentials.' }
if (-not (Test-Path -LiteralPath $VsixPath -PathType Leaf)) { throw "VSIX does not exist: $VsixPath" }
if (Test-Path -LiteralPath $OutputPath) { throw "Output already exists: $OutputPath" }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead([IO.Path]::GetFullPath($VsixPath))
try {
    $packageEntry = $archive.GetEntry('extension/package.json')
    $manifestEntry = $archive.GetEntry('extension.vsixmanifest')
    if (-not $packageEntry -or -not $manifestEntry) { throw 'VSIX is missing required IKEMaker identity metadata.' }
    $reader = [IO.StreamReader]::new($packageEntry.Open(), [Text.Encoding]::UTF8)
    try { $vsixPackage = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
    $reader = [IO.StreamReader]::new($manifestEntry.Open(), [Text.Encoding]::UTF8)
    try { [xml]$vsixManifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $archive.Dispose() }

$identity = $vsixManifest.PackageManifest.Metadata.Identity
$version = [string]$vsixPackage.version
if ([string]$vsixPackage.publisher -ne 'justnopoint' -or [string]$vsixPackage.name -ne 'ikemen-zss-tools' -or
    [string]$identity.Publisher -ne 'justnopoint' -or [string]$identity.Id -ne 'ikemen-zss-tools') {
    throw 'VSIX is not the expected justnopoint.ikemen-zss-tools extension.'
}
if ([string]$identity.Version -ne $version -or [string]$package.version -ne $version) {
    throw "VSIX/source identity version mismatch: package.json=$($package.version), VSIX package=$version, manifest=$($identity.Version)."
}

$file = Get-Item -LiteralPath $VsixPath
$hashAlgorithm = [Security.Cryptography.SHA256]::Create()
$fileStream = [IO.File]::OpenRead($file.FullName)
try { $packageHash = ([BitConverter]::ToString($hashAlgorithm.ComputeHash($fileStream))).Replace('-', '').ToLowerInvariant() }
finally { $fileStream.Dispose(); $hashAlgorithm.Dispose() }
$record = [ordered]@{
    schemaVersion = 1
    productId = 'ikemaker'
    releases = @([ordered]@{
        version = $version
        channel = $Channel
        publishedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
        compatibleEditor = [ordered]@{ min = $MinEditorVersion; max = '' }
        notes = @($Notes)
        package = [ordered]@{
            url = $asset.AbsoluteUri
            sha256 = $packageHash
            bytes = [long]$file.Length
        }
    })
}

$fullOutput = [IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Path (Split-Path -Parent $fullOutput) -Force | Out-Null
[IO.File]::WriteAllText($fullOutput, ($record | ConvertTo-Json -Depth 8) + "`n", [Text.UTF8Encoding]::new($false))
Write-Output $fullOutput
