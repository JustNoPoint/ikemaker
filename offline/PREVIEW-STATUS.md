# IKEMaker 0.79.8 tester-beta status

This package is a public beta for focused human testing, not a declaration that
every IKEMaker workspace has completed acceptance testing. Read `BETA-NOTES.txt`
for current highlights, known limits, planned additions, and installation details.

Use a disposable copy or independently backed-up project. Verify the active game,
character, source file, and preview before applying an edit. Stop and report any
unexpected write, wrong target, crash, or failed restoration.

Automated checks cover core source behavior, bundled helper/runtime resolution,
and package inventory. They cannot replace gameplay judgment, audio listening,
visual judgment, accessibility testing, clean-machine installation, unusual
workspace layouts, or every game-specific rule.

Neither tester bundle includes IKEMEN GO, MUGEN, game content, private project files,
or publisher credentials. The online bundle may obtain VS Code from Microsoft's
official update endpoint after Windows signature verification.

Standard packages omit Lua Language Server. Clearly labeled With-LuaLS variants
include its official VSIX but still require an explicit opt-in during installation.
IKEMaker never declares LuaLS as an automatic extension dependency.
