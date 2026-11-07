# IKeMeter in IKEMaker

Open **Tools → Open IKeMeter** in a shared header, or use the existing
**Switch Suite** arrow-swap button and choose IKeMeter. The command palette also
has **IKEMaker: Open IKeMeter**. The direct **Switch to IkeMiner** command keeps
its previous behavior. No extra primary toolbar icon or size/layout change is
introduced; the normal interface modes and project-scope filtering still apply.

Meter opens in one VS Code tab using the bundled, verified local tester. Another
click focuses that same host/runtime instead of starting a duplicate. Its full
runtime path is shown. Close the tab before selecting another runtime. Opening
or focusing Meter does not start a game, acquire the runtime lease, install a
bridge, or write project/game files. **Connect remains explicit**: it launches
the selected runtime, acquires its lease and temporarily installs its bridge.
Protected volatile sessions use Windows LocalAppData/IKeMeter.

Runtime selection reuses IKEMaker's current project/configured engine target,
including the registered exact-target resolver. It never substitutes a different
executable for an invalid pinned target. With no project runtime, an explicit
folder picker is offered. This tester requires Ikemen_GO.exe, external/mods and
save in that folder; it never creates a save directory in a real project merely
to open Meter. Current eligibility is the local offline QuickVS tester scope.

Closing the Meter tab or choosing **IKEMaker: Stop IKeMeter** stops its connected
owned test game, helper processes and host, and releases its lease. Disconnect
preserves the now-independent game, matching the tested standalone candidate;
it does not promise to terminate that game. Reopening waits for old-host cleanup
and starts disconnected. Extension shutdown also stops its owned host through
its private IPC channel. It never searches for or kills a process by name/PID.

## Portable app and PowerShell fallback

The default app payload exactly matches the 79-file manifest in local candidate
`IKeMeter-0.0.1-ownership-storage-local-candidate.zip`, SHA-256
`e3e6eeec1aedf5a2e5b9591eafc2be663410ffe19dd21dec37d48361b5487509`.
The integrated extension-owned host uses those tested app/controller/driver
modules while deferring the lease until Connect. Its webview uses only local
nonce-authorized assets and an allowlisted IPC-to-guarded-loopback API adapter;
there is no iframe, arbitrary command evaluation or widened Meter HTTP origin
policy.

**IKEMaker: Choose IKeMeter Launcher** selects Start-IKeMeter.ps1 from another
explicitly chosen extracted tester package. Its manifest and required files are
checked before any package code runs. Clear the user-level
`ikemenZss.ikeMeterLauncher` setting to return to the bundled app. Workspace
settings and workspace-discovered scripts never select executable Meter code.

PowerShell 7 is resolved from the actual process PATH, standard Program Files
location, or the current user's installed Codex primary runtime. Candidates in
workspace code are refused. It is version-checked before opening Meter, rather
than letting Connect fail later. A portable user-only
`ikemenZss.ikeMeterPowerShellPath` can name an installed pwsh.exe explicitly.
Both executable preferences are application scoped and ignore workspace values.
The integrated host runs using VS Code's own Node/Electron runtime, so a normal
VS Code launch does not need the Codex shell's Node or PowerShell PATH additions.

Only trusted local Windows workspaces can open the native tester. Remote,
virtual, untrusted and browser activation paths report unavailable instead of
starting native processes. Activation/registration alone is inert.

## Runtime scope

Meter is a local Windows tester for trusted workspaces. Its 500-microsecond p95
performance target remains unverified for this release. When the runtime
cannot supply a sample or a previous interval lost contact, use the retained
history in the inspector to distinguish the last observation from live data.
