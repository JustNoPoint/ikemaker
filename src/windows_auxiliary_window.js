'use strict';

const childProcess = require('child_process');

function resizeScript(delta) {
  const amount = Math.max(-2000, Math.min(2000, Math.round(Number(delta) || 0)));
  return `$ErrorActionPreference='Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class IKEMakerWindow {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
}
'@
$handle=[IKEMakerWindow]::GetForegroundWindow()
if($handle -eq [IntPtr]::Zero){exit 2}
[uint32]$processId=0
[void][IKEMakerWindow]::GetWindowThreadProcessId($handle,[ref]$processId)
$process=Get-Process -Id $processId -ErrorAction Stop
if([IO.Path]::GetFileName($process.Path) -ine 'Code.exe'){exit 3}
if([IKEMakerWindow]::IsIconic($handle) -or [IKEMakerWindow]::IsZoomed($handle)){exit 4}
$rect=[IKEMakerWindow+RECT]::new()
if(-not [IKEMakerWindow]::GetWindowRect($handle,[ref]$rect)){exit 5}
$width=[Math]::Max(360,($rect.Right-$rect.Left)+(${amount}))
$height=[Math]::Max(300,$rect.Bottom-$rect.Top)
if(-not [IKEMakerWindow]::SetWindowPos($handle,[IntPtr]::Zero,0,0,$width,$height,0x0016)){exit 6}`;
}

function resizeActiveAuxiliaryWindowBy(delta, options = {}) {
  if (process.platform !== 'win32' || !Number.isFinite(Number(delta)) || Math.abs(Number(delta)) < 1) return Promise.resolve(false);
  const execute = options.execFile || childProcess.execFile;
  return new Promise(resolve => {
    execute('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', resizeScript(delta)], { windowsHide: true, timeout: 5000 }, error => resolve(!error));
  });
}

module.exports = { resizeScript, resizeActiveAuxiliaryWindowBy };
