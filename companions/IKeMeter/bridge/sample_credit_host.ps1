param(
    [Parameter(Mandatory = $true)][string]$QueuePath,
    [Parameter(Mandatory = $true)][string]$StopPath,
    [Parameter(Mandatory = $true)][string]$ReadyPath
)
$ErrorActionPreference = 'Stop'
if ($null -eq ('IKeMeter.SecurePipeNative' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'SecurePipeNative.cs') }
if ($null -eq ('OwnedWindowNative' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'OwnedWindowNative.cs') }
[IO.File]::WriteAllText($ReadyPath, 'ready', [Text.Encoding]::ASCII)
while (-not (Test-Path -LiteralPath $StopPath)) {
    if (-not (Test-Path -LiteralPath $QueuePath)) { Start-Sleep -Milliseconds 5; continue }
    $job = Get-Content -LiteralPath $QueuePath -Raw | ConvertFrom-Json
    Remove-Item -LiteralPath $QueuePath -Force
    $server = $null
    try {
        $server = [IKeMeter.SecurePipeNative]::CreateInbound([string]$job.pipeName)
        [IO.File]::WriteAllText([string]$job.readyPath, 'ready', [Text.Encoding]::ASCII)
        $connectCancel = [Threading.CancellationTokenSource]::new(1000)
        try { $server.WaitForConnectionAsync($connectCancel.Token).GetAwaiter().GetResult() } catch [OperationCanceledException] {
            $noClient=-not $server.IsConnected;$server.Dispose();$server=$null
            $modal=$false
            if($noClient -and $null -ne $job.nativeWindow){$proof=$job.nativeWindow;$modal=[OwnedWindowNative]::ModalNow([string]$proof.hwnd,[int]$proof.processId,[uint32]$proof.threadId,[string]$proof.processStarted)}
            $failure = [ordered]@{ bounded=$false; bytes=0; error=if($noClient){'accept-deadline-exceeded'}else{'accept-cancel-race'}; payload=''; acceptCompleted=(-not $noClient); listenerRetired=$true; retiredWhileOwnedModal=$modal; nativeWindow=$job.nativeWindow }
            $tempResult = ([string]$job.resultPath) + '.tmp'; [IO.File]::WriteAllText($tempResult, ($failure | ConvertTo-Json -Depth 4 -Compress), [Text.Encoding]::UTF8); Move-Item -LiteralPath $tempResult -Destination ([string]$job.resultPath) -Force
            continue
        } finally { $connectCancel.Dispose() }
        $buffer = [byte[]]::new(4101); $cancel = [Threading.CancellationTokenSource]::new(1000); $count = 0; $errorText = ''
        try {
            while ($count -lt $buffer.Length) {
                $read = $server.ReadAsync($buffer, $count, $buffer.Length - $count, $cancel.Token).GetAwaiter().GetResult()
                if ($read -eq 0) { break }; $count += $read
            }
        } catch [OperationCanceledException] { $errorText = 'deadline-exceeded' } finally { $cancel.Dispose() }
        $declared = if ($count -ge 4) { [BitConverter]::ToUInt32($buffer, 0) } else { 0 }
        $bounded = $errorText -eq '' -and $declared -le 4096 -and $count -eq (4 + $declared)
        if ($errorText -eq '' -and -not $bounded) { $errorText = 'invalid-length-or-trailing-bytes' }
        $result = [ordered]@{ bounded=$bounded; bytes=if($bounded){$declared}else{0}; error=$errorText; payload=if($bounded){[Text.Encoding]::UTF8.GetString($buffer,4,[int]$declared)}else{''} }
        $tempResult = ([string]$job.resultPath) + '.tmp'; [IO.File]::WriteAllText($tempResult, ($result | ConvertTo-Json -Compress), [Text.Encoding]::UTF8); Move-Item -LiteralPath $tempResult -Destination ([string]$job.resultPath) -Force
    } finally { if ($null -ne $server) { $server.Dispose() } }
}
