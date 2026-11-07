param(
    [Parameter(Mandatory = $true)]
    [string]$Runtime,
    [string]$Player1 = 'kfm',
    [string]$Player2 = 'kfm',
    [string]$PowerShell = 'pwsh.exe'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolvedRuntime = (Resolve-Path -LiteralPath $Runtime).Path
$executable = Join-Path $resolvedRuntime 'Ikemen_GO.exe'
if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "The selected folder does not contain Ikemen_GO.exe: $resolvedRuntime"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js 20 or newer is required to run IKeMeter.'
}
$nodeMajor = & node -p "process.versions.node.split('.')[0]"
if ($LASTEXITCODE -ne 0 -or [int]$nodeMajor -lt 20) { throw 'Node.js 20 or newer is required.' }
$resolvedPowerShell = (Get-Command $PowerShell -ErrorAction SilentlyContinue).Source
if (-not $resolvedPowerShell) { throw 'PowerShell 7 (pwsh.exe) is required to run IKeMeter pipe helpers.' }
$powerShellMajor = & $resolvedPowerShell -NoProfile -Command '$PSVersionTable.PSVersion.Major'
if ($LASTEXITCODE -ne 0 -or [int]$powerShellMajor -lt 7) { throw 'PowerShell 7 or newer is required.' }
$env:IKEMETER_RUNTIME = $resolvedRuntime
$env:IKEMETER_P1 = $Player1
$env:IKEMETER_P2 = $Player2
$env:IKEMETER_PWSH = $resolvedPowerShell
Write-Host 'IKeMeter will print its private local URL below. Open that URL in your browser.'
& node (Join-Path $root 'src\app_server.js')
if ($LASTEXITCODE -ne 0) { throw 'IKeMeter stopped with an error; review the message above.' }
