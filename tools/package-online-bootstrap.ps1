param(
    [string]$OutputPath,
    [string]$VsixPath,
    [string]$LuaVsixPath
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'release-output.ps1')
$releaseDirectory = Get-IkemakerReleaseDirectory $root
$package = Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json
$version = [string]$package.version
$luaVersion = '3.19.1'
if ([string]::IsNullOrWhiteSpace($VsixPath)) { $VsixPath = Join-Path $releaseDirectory ("ikemen-zss-tools-{0}.vsix" -f $version) }
if (-not (Test-Path -LiteralPath $VsixPath)) { & (Join-Path $PSScriptRoot 'package-vsix.ps1') -OutputPath $VsixPath | Out-Null }
if ([string]::IsNullOrWhiteSpace($LuaVsixPath)) { $LuaVsixPath = Join-Path $root ("third_party\Lua-Language-Server-{0}-win32-x64.vsix" -f $luaVersion) }
if (-not (Test-Path -LiteralPath $LuaVsixPath)) { throw "Official Lua Language Server VSIX is missing: $LuaVsixPath" }
if ([string]::IsNullOrWhiteSpace($OutputPath)) { $OutputPath = Join-Path $releaseDirectory ("IKEMaker-{0}-Windows-Online-Bootstrap.zip" -f $version) }
$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
if (Test-Path -LiteralPath $OutputPath) { throw "Output already exists: $OutputPath" }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::CreateNew)
$zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
function Add-File([string]$Source, [string]$Name) { [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $Source, $Name, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null }
function Add-Text([string]$Name, [string]$Value) { $entry=$zip.CreateEntry($Name,[System.IO.Compression.CompressionLevel]::Optimal);$writer=[System.IO.StreamWriter]::new($entry.Open(),[System.Text.UTF8Encoding]::new($false));try{$writer.Write($Value)}finally{$writer.Dispose()} }
try {
    Add-File $VsixPath 'IKEMEN-Creator-Tools.vsix'
    Add-File $LuaVsixPath 'Lua-Language-Server.vsix'
    Add-File (Join-Path $root 'offline\Install IKEMaker Online.cmd') 'Install IKEMaker Online.cmd'
    Add-File (Join-Path $root 'offline\Install-IKEMaker-Online.ps1') 'Install-IKEMaker-Online.ps1'
    Add-File (Join-Path $root 'offline\README-ONLINE-BOOTSTRAP.txt') 'README-FIRST.txt'
    Add-File (Join-Path $root 'offline\BETA-NOTES.txt') 'BETA-NOTES.txt'
    Add-File (Join-Path $root 'offline\BETA-TEST-CHECKLIST.txt') 'BETA-TEST-CHECKLIST.txt'
    Add-File (Join-Path $root 'offline\BETA-TEST-REPORT.txt') 'BETA-TEST-REPORT.txt'
    Add-File (Join-Path $root 'offline\PREVIEW-STATUS.md') 'PREVIEW-STATUS.md'
    Add-File (Join-Path $root 'THIRD-PARTY-NOTICES.md') 'THIRD-PARTY-NOTICES.md'
    Add-File (Join-Path $root 'LICENSE') 'licenses/IKEMaker-LICENSE.txt'
    Add-File (Join-Path $root 'third_party\Lua-Language-Server-LICENSE.txt') 'licenses/Lua-Language-Server-LICENSE.txt'
    $hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $VsixPath).Hash;$luaHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $LuaVsixPath).Hash
    Add-Text 'SHA256SUMS.txt' (("{0}  IKEMEN-Creator-Tools.vsix`r`n" -f $hash)+("{0}  Lua-Language-Server.vsix`r`n" -f $luaHash))
} finally { $zip.Dispose();$stream.Dispose() }
Write-Output $OutputPath
