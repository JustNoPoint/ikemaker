param([Parameter(Mandatory)][int]$GamePid,[Parameter(Mandatory)][int]$HostPid,[Parameter(Mandatory)][string]$Executable)
$ErrorActionPreference='Stop'
$game=[Diagnostics.Process]::GetProcessById($GamePid);$null=$game.Handle
try {
 if($game.MainModule.FileName -ne $Executable){throw 'Owned executable mismatch'}
 $native=Get-CimInstance Win32_Process -Filter "ProcessId=$GamePid"
 if($native.ParentProcessId -ne $HostPid){throw 'Owned parent mismatch'}
 $started=$game.StartTime.ToUniversalTime().Ticks.ToString()
 Add-Type -Path (Join-Path $PSScriptRoot 'OwnedWindowNative.cs')
 $clock=[Diagnostics.Stopwatch]::StartNew();$h=[IntPtr]::Zero
 while($h -eq [IntPtr]::Zero -and $clock.ElapsedMilliseconds -lt 3000){if($game.HasExited){throw 'Owned process exited'};$h=[OwnedWindowNative]::Find($GamePid);if($h -eq [IntPtr]::Zero){Start-Sleep -Milliseconds 25}}
 if($h -eq [IntPtr]::Zero){throw 'No unique visible owned game window'}
 $sequence=0
 while(-not $game.HasExited){
  $value=[OwnedWindowNative]::Read($h,$GamePid);$sequence++
  if($sequence -eq 1 -and $value.moving){throw 'Observer has no preceding non-modal state'}
  $record=[ordered]@{observedAtMs=([double]([Diagnostics.Stopwatch]::GetTimestamp())*1000/[Diagnostics.Stopwatch]::Frequency);version=1;sequence=$sequence;processId=$GamePid;processStarted=$started;threadId=$value.threadId;hwnd=$h.ToInt64().ToString();moving=$value.moving;moveSizeHwnd=$value.moveSizeHwnd;visible=$value.visible;minimized=$value.minimized}
  [Console]::Out.WriteLine(($record|ConvertTo-Json -Compress));[Console]::Out.Flush()
  Start-Sleep -Milliseconds 100
 }
} finally {$game.Dispose()}
