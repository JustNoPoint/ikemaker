$ErrorActionPreference = 'Stop'
if ($null -eq ('IKeMeter.SecurePipeNative' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'SecurePipeNative.cs') }
if ($null -eq ('OwnedWindowNative' -as [type])) { Add-Type -Path (Join-Path $PSScriptRoot 'OwnedWindowNative.cs') }
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
function Send-RelayFrame($value) {
    [Console]::Out.WriteLine(($value | ConvertTo-Json -Depth 5 -Compress))
    [Console]::Out.Flush()
}
Send-RelayFrame @{ type='ready' }
while ($null -ne ($line = [Console]::In.ReadLine())) {
    if ($line.Length -gt 2048) { throw 'Oversized local sample credit' }
    $job = $line | ConvertFrom-Json
    if ($job.pipeName -cnotmatch '^ikemeter-[A-Za-z0-9_-]+$' -or $job.sequence -lt 2) { throw 'Invalid local sample credit' }
    $server = [IKeMeter.SecurePipeNative]::CreateInbound([string]$job.pipeName)
    try {
        Send-RelayFrame @{type='listening';sequence=$job.sequence}
        $connectCancel = [Threading.CancellationTokenSource]::new(1000)
        try {
            [void]$server.WaitForConnectionAsync($connectCancel.Token).GetAwaiter().GetResult()
        } catch [OperationCanceledException] {
            $noClient = -not $server.IsConnected
            $server.Dispose(); $server = $null
            $modal = $false
            if ($noClient -and $null -ne $job.nativeWindow) {
                $p = $job.nativeWindow
                $modal = [OwnedWindowNative]::ModalNow([string]$p.hwnd,[int]$p.processId,[uint32]$p.threadId,[string]$p.processStarted)
            }
            Send-RelayFrame @{type='result';sequence=$job.sequence;bounded=$false;bytes=0;
                error=if($noClient){'accept-deadline-exceeded'}else{'accept-cancel-race'};payload='';
                acceptCompleted=(-not $noClient);listenerRetired=$true;retiredWhileOwnedModal=$modal;nativeWindow=$job.nativeWindow}
            continue
        } finally { $connectCancel.Dispose() }
        $buffer=[byte[]]::new(4101); $deadline=[Threading.CancellationTokenSource]::new(1000); $count=0; $errorText=''
        try {
            while ($count -lt $buffer.Length) {
                $read = $server.ReadAsync($buffer,$count,$buffer.Length-$count,$deadline.Token).GetAwaiter().GetResult()
                if ($read -eq 0) { break }
                $count += $read
            }
        } catch [OperationCanceledException] { $errorText='deadline-exceeded' } finally { $deadline.Dispose() }
        $declared=if($count -ge 4){[BitConverter]::ToUInt32($buffer,0)}else{0}
        $bounded=$errorText -eq '' -and $declared -ge 1 -and $declared -le 4096 -and $count -eq (4+$declared)
        if (-not $bounded -and $errorText -eq '') { $errorText='invalid-length-or-trailing-bytes' }
        Send-RelayFrame @{type='result';sequence=$job.sequence;bounded=$bounded;bytes=if($bounded){$declared}else{0};
            error=$errorText;payload=if($bounded){[Text.Encoding]::UTF8.GetString($buffer,4,[int]$declared)}else{''}}
    } finally { if ($null -ne $server) { $server.Dispose() } }
}
