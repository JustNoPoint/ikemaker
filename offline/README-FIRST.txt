IKEMAKER 0.79.8 — WINDOWS OFFLINE / EXISTING VS CODE PACKAGE

Use this package when Visual Studio Code is already installed.

1. Extract the entire ZIP and keep its files together.
2. Run "Install IKEMEN Creator Tools.cmd".
3. Restart or reload Visual Studio Code.
4. Confirm IKEMaker 0.79.8 is shown in the status bar.
5. Read BETA-NOTES.txt before editing valuable work.

The package includes IKEMaker, its bundled native asset builders and required
runtimes (including SprMaker2, SndMaker, and SFF2PNG), and offline documentation.
It works offline after installation.
Project-local tools and explicitly configured tool paths still take priority.

Manual installation: in VS Code, open Extensions, choose the ... menu, select
"Install from VSIX...", and choose IKEMEN-Creator-Tools.vsix.

The standard package does not contain or install Lua Language Server. A clearly
labeled With-LuaLS package includes its official VSIX and offers an explicit
[y/N] choice; pressing Enter skips installing Lua Language Server, and any
existing installation is left unchanged. IKEMaker's built-in Lua help
works either way.

SHA256SUMS.txt records every included VSIX file. This package contains no engine,
game, character, stage, private workspace, MUGEN executable, or credentials.
