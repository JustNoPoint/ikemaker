param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'release-output.ps1')
$releaseDirectory = Get-IkemakerReleaseDirectory $root
$packagePath = Join-Path $root 'package.json'
$package = Get-Content -Raw -LiteralPath $packagePath | ConvertFrom-Json
$version = [string]$package.version

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $releaseDirectory ("ikemen-zss-tools-{0}.vsix" -f $version)
}
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
if (Test-Path -LiteralPath $OutputPath) {
    throw "Output already exists: $OutputPath"
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::CreateNew)
$zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)

function Add-TextEntry([string]$Name, [string]$Text) {
    $entry = $zip.CreateEntry($Name, [System.IO.Compression.CompressionLevel]::Optimal)
    $writer = [System.IO.StreamWriter]::new($entry.Open(), [System.Text.UTF8Encoding]::new($false))
    try { $writer.Write($Text) } finally { $writer.Dispose() }
}

function Add-FileEntry([string]$Source, [string]$Name) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip,
        $Source,
        $Name.Replace('\', '/'),
        [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
}

try {
    $description = 'A cohesive visual creation, project, team, testing, and release workspace for IKEMEN GO.'
    $extensionPack = @($package.extensionPack) -join ','
    $manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="$($package.name)" Version="$version" Publisher="$($package.publisher)" />
    <DisplayName>$($package.displayName)</DisplayName>
    <Description xml:space="preserve">$description</Description>
    <Tags>$($package.keywords -join ',')</Tags>
    <Categories>$($package.categories -join ',')</Categories>
    <GalleryFlags>Public</GalleryFlags>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="$($package.engines.vscode)" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionPack" Value="$extensionPack" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE.txt" Addressable="true" />
  </Assets>
</PackageManifest>
"@
    $contentTypes = '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension=".png" ContentType="image/png"/><Default Extension=".js" ContentType="application/javascript"/><Default Extension=".json" ContentType="application/json"/><Default Extension=".md" ContentType="text/markdown"/><Default Extension=".txt" ContentType="text/plain"/><Default Extension=".exe" ContentType="application/vnd.microsoft.portable-executable"/><Default Extension=".vsixmanifest" ContentType="text/xml"/></Types>'
    Add-TextEntry 'extension.vsixmanifest' $manifest
    Add-TextEntry '[Content_Types].xml' $contentTypes

    $topFiles = @(
        'package.json', 'README.md', 'language-configuration.json',
        'cns-language-configuration.json', 'def-language-configuration.json', 'pnpm-lock.yaml',
        'THIRD-PARTY-NOTICES.md'
    )
    foreach ($name in $topFiles) {
        $source = Join-Path $root $name
        if (Test-Path -LiteralPath $source) { Add-FileEntry $source ("extension/$name") }
    }
    Add-FileEntry (Join-Path $root 'LICENSE') 'extension/LICENSE.txt'

    foreach ($directory in @('src', 'data', 'media', 'snippets', 'syntaxes', 'bin')) {
        $base = Join-Path $root $directory
        Get-ChildItem -LiteralPath $base -File -Recurse | ForEach-Object {
            # Windows PowerShell 5.1 runs on .NET Framework, which does not
            # provide Path.GetRelativePath. Both paths are absolute here.
            $relative = $_.FullName.Substring($root.Length).TrimStart([char[]]@('\', '/'))
            Add-FileEntry $_.FullName ("extension/$relative")
        }
    }
}
finally {
    $zip.Dispose()
    $stream.Dispose()
}

Write-Output $OutputPath
