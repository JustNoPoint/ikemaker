param([switch]$InstallLuaLanguageServer)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$ikemakerVsix = Join-Path $here 'IKEMEN-Creator-Tools.vsix'
$luaVsix = Join-Path $here 'Lua-Language-Server.vsix'
$officialVsCodeUrl = 'https://update.code.visualstudio.com/latest/win32-x64-user/stable'

function Find-CodeCli {
    $command = Get-Command code.cmd -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    foreach ($candidate in @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code.cmd'),
        (Join-Path $env:ProgramFiles 'Microsoft VS Code\bin\code.cmd'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft VS Code\bin\code.cmd')
    )) { if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate } }
    return $null
}

if (-not (Test-Path -LiteralPath $ikemakerVsix)) { throw 'IKEMEN-Creator-Tools.vsix is missing beside the bootstrap.' }
$codeCli = Find-CodeCli
if (-not $codeCli) {
    Write-Host 'Visual Studio Code was not found. Downloading the official Microsoft user installer...'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $installer = Join-Path $env:TEMP ("VSCodeUserSetup-IKEMaker-{0}.exe" -f [Guid]::NewGuid().ToString('N'))
    try {
        Invoke-WebRequest -Uri $officialVsCodeUrl -OutFile $installer -UseBasicParsing
        $signature = Get-AuthenticodeSignature -LiteralPath $installer
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
            throw "The downloaded VS Code installer did not have a valid Microsoft Corporation signature (status: $($signature.Status))."
        }
        Write-Host 'Microsoft signature verified. Installing Visual Studio Code for the current user...'
        $process = Start-Process -FilePath $installer -ArgumentList '/VERYSILENT','/NORESTART','/MERGETASKS="addcontextmenufiles,addcontextmenufolders,addtopath"' -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw "Visual Studio Code installer returned exit code $($process.ExitCode)." }
    }
    finally { if (Test-Path -LiteralPath $installer) { Remove-Item -LiteralPath $installer -Force } }
    $codeCli = Find-CodeCli
    if (-not $codeCli) { throw 'VS Code installation completed but its command-line installer could not be located. Restart Windows and rerun this bootstrap.' }
}

Write-Host 'Installing IKEMaker...'
& $codeCli --install-extension $ikemakerVsix --force
if ($LASTEXITCODE -ne 0) { throw "IKEMaker installation returned exit code $LASTEXITCODE." }
if ($InstallLuaLanguageServer) {
    if (-not (Test-Path -LiteralPath $luaVsix)) {
        Write-Warning 'IKEMaker installed, but the selected optional Lua companion is not included in this package.'
        Write-Host 'Download the clearly labeled With-LuaLS package, or install a Lua extension separately if desired.'
        exit 4
    }
    Write-Host 'Installing the selected optional Lua Language Server...'
    & $codeCli --install-extension $luaVsix --force
    if ($LASTEXITCODE -ne 0) {
        Write-Warning 'IKEMaker installed, but the selected optional Lua companion failed.'
        Write-Host 'Recovery: in VS Code choose Extensions > ... > Install from VSIX... and select Lua-Language-Server.vsix.'
        exit 4
    }
    Write-Host 'IKEMaker and the selected optional Lua Language Server are installed. Restart VS Code if it was already open.'
    exit 0
}
Write-Host "IKEMaker is installed. No optional Lua extension was requested. Restart VS Code if it was already open."
