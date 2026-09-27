IKEMAKER 0.79.8 — WINDOWS ONLINE / FIRST-TIME PACKAGE

Use this package when Visual Studio Code may not be installed.

1. Extract the entire ZIP and keep its files together.
2. Run "Install IKEMaker Online.cmd".
3. If VS Code is absent, the bootstrap downloads the current stable 64-bit User
   Installer from Microsoft's official update.code.visualstudio.com endpoint.
4. The installer runs only after Windows reports a valid Microsoft Corporation
   Authenticode signature.
5. IKEMaker is installed. No separate Lua extension is downloaded automatically.
6. Restart or reload VS Code and confirm IKEMaker 0.79.8.
7. Read BETA-NOTES.txt before editing valuable work.

IKEMaker includes its native asset builders and required runtimes (including
SprMaker2, SndMaker, and SFF2PNG) plus offline documentation. If VS Code is already
installed, no VS Code download occurs. The package contains no engine, game,
character, stage, private workspace, MUGEN executable, or credentials.

The standard package does not contain or install Lua Language Server. A clearly
labeled With-LuaLS package includes its official VSIX and offers an explicit
[y/N] choice; pressing Enter skips installing Lua Language Server, and any
existing installation is left unchanged. IKEMaker's built-in Lua help
works either way.
