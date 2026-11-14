param(
    [Parameter(Mandatory = $true)][string]$PipeName,
    [Parameter(Mandatory = $true)][string]$ResultPath,
    [string]$ReadyPath = '',
    [ValidateSet('Frame', 'Presence')][string]$Mode = 'Frame',
    [ValidateSet('Metadata', 'Telemetry', 'Sample', 'Ack')][string]$Kind = 'Metadata'
)

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
if ($null -eq ('IKeMeter.SecurePipeNative' -as [type])) {
    Add-Type -Path (Join-Path $PSScriptRoot 'SecurePipeNative.cs')
}
$server = [IKeMeter.SecurePipeNative]::CreateInbound($PipeName)
try {
    if ($ReadyPath -ne '') { [System.IO.File]::WriteAllText($ReadyPath, 'ready', [System.Text.Encoding]::ASCII) }
    $server.WaitForConnection()
    if ($Mode -eq 'Presence') {
        $result = [ordered]@{
            sid = $identity.User.Value
            currentUserOnly = $true
            remoteClientsRejected = $true
            remoteRestrictionStatus = 'PIPE_REJECT_REMOTE_CLIENTS'
            consumed = $true
        }
        [System.IO.File]::WriteAllText($ResultPath, ($result | ConvertTo-Json), [System.Text.Encoding]::UTF8)
        return
    }
    # One little-endian uint32 length followed by at most 4096 payload bytes.
    # EOF is required so a valid prefix cannot hide trailing bytes.
    $buffer = [byte[]]::new(4101)
    $cancel = [System.Threading.CancellationTokenSource]::new(1000)
    $count = 0
    $readError = ''
    try {
        while ($count -lt $buffer.Length) {
            $read = $server.ReadAsync($buffer, $count, $buffer.Length - $count, $cancel.Token).GetAwaiter().GetResult()
            if ($read -eq 0) { break }
            $count += $read
        }
    } catch [System.OperationCanceledException] {
        $readError = 'deadline-exceeded'
    }
    $declared = if ($count -ge 4) { [BitConverter]::ToUInt32($buffer, 0) } else { 0 }
    $bounded = $readError -eq '' -and $declared -le 4096 -and $count -eq (4 + $declared)
    if ($readError -eq '' -and -not $bounded) { $readError = 'invalid-length-or-trailing-bytes' }
    $fields = [ordered]@{}
    if ($bounded -and $Kind -ne 'Metadata') {
        $text = [Text.Encoding]::UTF8.GetString($buffer, 4, [int]$declared)
        $allowed = if ($Kind -eq 'Ack') { @('epoch','seq','op','status','tick','from','reason','held') } elseif ($Kind -eq 'Sample') { @('epoch','tick','complete','count') } else { @('session','epoch','tick','mode') }
        foreach ($part in ($text -split "`t")) {
            if ($part -match '^([A-Za-z][A-Za-z0-9]*)=([A-Za-z0-9_.,+-]+)$') {
                $fieldName = $Matches[1]; $fieldValue = $Matches[2]
                if (($allowed -contains $fieldName) -or ($Kind -eq 'Sample' -and $fieldName -match '^entity[0-9]+$')) { $fields[$fieldName] = $fieldValue }
            }
        }
    }
    $result = [ordered]@{
        sid = $identity.User.Value
        currentUserOnly = $true
        remoteClientsRejected = $true
        remoteRestrictionStatus = 'PIPE_REJECT_REMOTE_CLIENTS'
        bounded = $bounded
        bytes = if ($bounded) { $declared } else { 0 }
        error = $readError
        fields = $fields
    }
    [System.IO.File]::WriteAllText($ResultPath, ($result | ConvertTo-Json -Depth 3), [System.Text.Encoding]::UTF8)
} finally {
    if ($null -ne $server) { $server.Dispose() }
}
