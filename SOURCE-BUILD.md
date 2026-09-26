# IKEMaker 0.78.0 source snapshot

This repository baseline contains the reviewed source and public build inputs used
for IKEMaker 0.78.0.
IKEMaker is designed and directed by JustNoPoint (JNP) and is licensed under the
MIT License. Third-party components retain their own licenses and notices.

## Requirements

- Windows PowerShell 5.1 or newer to create the VSIX and Windows bundles.
- Node.js to run the automated test suite.
- Visual Studio Code to install and use the resulting VSIX.

No package download is required to build the IKEMaker VSIX or run its tests. The
reviewed native builders, required runtimes, and offline documentation are kept
in Git. The 11 MB prebuilt Lua Language Server VSIX is intentionally not tracked.
The historical 0.78.0 Windows-bundle scripts require a separately supplied
`-LuaVsixPath`. Use only the reviewed 3.19.1 payload with this exact identity:

- Filename: `Lua-Language-Server-3.19.1-win32-x64.vsix`
- Size: `11080310` bytes
- SHA-256: `C0A7489AD58358DDF2590F6782C94FA9308076B73AAA30B456932373B0D8CB28`

That exact payload remains preserved in the immutable 0.78.0 source release asset.
Do not substitute a similarly named file without reviewing its provenance and
hash. IKEMaker 0.78.1 and later can build their standard Windows packages without
this companion payload.

## Test

From the extracted source directory:

```powershell
npm test
```

## Build the IKEMaker VSIX

```powershell
.\tools\package-vsix.ps1 -OutputPath .\ikemen-zss-tools-0.78.0.vsix
```

## Build the Windows packages

After building the VSIX:

```powershell
.\tools\package-offline.ps1 `
  -VsixPath .\ikemen-zss-tools-0.78.0.vsix `
  -LuaVsixPath <reviewed-luals-vsix> `
  -OutputPath .\IKEMaker-0.78.0-Windows-Offline.zip

.\tools\package-online-bootstrap.ps1 `
  -VsixPath .\ikemen-zss-tools-0.78.0.vsix `
  -LuaVsixPath <reviewed-luals-vsix> `
  -OutputPath .\IKEMaker-0.78.0-Windows-Online-Bootstrap.zip
```

The packaging scripts use only the repository plus the explicitly supplied,
hash-verified companion file when output paths are supplied. Generated caches,
previous package-review extractions, `node_modules`, compiled release packages,
and private game or workspace directories are intentionally excluded.
