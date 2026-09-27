# Building IKEMaker 0.79.0

This repository contains the reviewed source and public build inputs for
IKEMaker 0.79.0.
IKEMaker is designed and directed by JustNoPoint (JNP) and is licensed under the
MIT License. Third-party components retain their own licenses and notices.

## Requirements

- Windows PowerShell 5.1 or newer to create the VSIX and Windows bundles.
- Node.js to run the automated test suite.
- Visual Studio Code to install and use the resulting VSIX.

No package download is required to build the IKEMaker VSIX or run its tests. The
reviewed native builders, required runtimes, and offline documentation are kept
in Git. The 11 MB prebuilt Lua Language Server VSIX is intentionally not tracked.
Standard packages do not need LuaLS. The explicitly requested
`With-LuaLS` variants require a separately supplied, reviewed companion file.
Use only the 3.19.1 payload with this exact identity:

- Filename: `Lua-Language-Server-3.19.1-win32-x64.vsix`
- Size: `11080310` bytes
- SHA-256: `C0A7489AD58358DDF2590F6782C94FA9308076B73AAA30B456932373B0D8CB28`

That exact payload remains preserved in the immutable 0.78.0 source release asset.
Do not substitute a similarly named file without reviewing its provenance and
hash.

## Test

From the extracted source directory:

```powershell
npm test
```

## Build the IKEMaker VSIX

```powershell
.\tools\package-vsix.ps1 -OutputPath .\ikemen-zss-tools-0.79.0.vsix
```

## Build the Windows packages

After building the VSIX:

```powershell
.\tools\package-offline.ps1 `
  -VsixPath .\ikemen-zss-tools-0.79.0.vsix `
  -OutputPath .\IKEMaker-0.79.0-Windows-Offline.zip

.\tools\package-online-bootstrap.ps1 `
  -VsixPath .\ikemen-zss-tools-0.79.0.vsix `
  -OutputPath .\IKEMaker-0.79.0-Windows-Online-Bootstrap.zip
```

To build the clearly labeled companion variants after placing the reviewed LuaLS
file at `third_party\Lua-Language-Server-3.19.1-win32-x64.vsix`:

```powershell
.\tools\package-offline.ps1 `
  -VsixPath .\ikemen-zss-tools-0.79.0.vsix `
  -OutputPath .\IKEMaker-0.79.0-Windows-Offline-With-LuaLS.zip `
  -IncludeLuaLanguageServer

.\tools\package-online-bootstrap.ps1 `
  -VsixPath .\ikemen-zss-tools-0.79.0.vsix `
  -OutputPath .\IKEMaker-0.79.0-Windows-Online-Bootstrap-With-LuaLS.zip `
  -IncludeLuaLanguageServer
```

The standard packaging scripts use only the repository. Companion builds also
use the explicitly supplied, hash-verified LuaLS file. Generated caches,
previous package-review extractions, `node_modules`, compiled release packages,
and private game or workspace directories are intentionally excluded.
