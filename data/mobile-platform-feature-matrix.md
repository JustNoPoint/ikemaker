# IKEMEN ZSS Tools — Mobile Feature Expectations

This sheet describes the intended mobile-compatible extension, not a claim that
the current desktop build already provides every item. Mobile functions must be
shown only when the host can actually support them.

## Verified browser build today

The browser extension currently provides:

- ZSS, CNS, AIR, DEF, CMD, and Lua grammar/snippet support supplied by VS Code.
- Independent Learning/Advanced settings for ZSS, Lua, CNS, assets, and
  stage/screenpack work.
- A bundled, searchable IKEMEN 1.0 controller catalog.
- Reviewed ZSS controller insertion with required and selected optional values.
- Portable ZSS controller/trigger, CNS controller, and Lua API completion plus
  bundled hover descriptions.
- A read-only portable ZSS/CNS/Lua structure report.
- A deliberately smaller, read-only current-file ZSS review that labels itself
  as non-equivalent to the complete desktop analyzer.
- Offline documentation, the SFF standards, artist handoff guide, and platform
  capability reports.

The browser build does **not** currently parse or visually edit SFF, AIR, or SND
archives. Opening SFF/SND shows an honest read-only placeholder. It also does
not yet provide the complete project registry, workbench, desktop audit suite,
stage/screenpack visual canvases, builders, external editors, or IKEMEN launch.

## Android

Android can use either a browser-hosted VS Code environment or a locally hosted
Node/code-server environment. Local hosting provides more filesystem access,
but neither environment can execute the existing Windows SprMaker2 or SndMaker
programs.

### Target editor features beyond the verified browser build

- ZSS, CNS, AIR, DEF, CMD, and configuration syntax coloring.
- Code navigation, state/function lists, controller reference, snippets, and
  project metadata viewers.
- Text-based audits, naming/numbering assistance, requirements checklists, and
  portable character-workbench organization.
- AIR animation preview and authored Clsn1/Clsn2 viewing and editing.
- SFF v2.x sprite, axis, palette, layer, naming, and requirement inspection.
- SND group/index browsing, event names, archive validation, waveform display,
  and in-browser playback where the mobile browser supports the WAV format.
- Sound-profile editing, CommonFX DEF generation, voice-pack contract audits,
  reference scans, and readable build-manifest generation.
- Export of generated text, manifests, reports, palettes, sprites, and sounds
  when the selected Android VS Code host grants file access.
- Platform-aware messages that explain why an unavailable desktop action is
  disabled instead of failing silently.

### Features that may require a locally hosted Android workspace

- Direct access to a complete IKEMEN project stored on the device.
- Opening exported files in another installed Android application.
- Invoking command-line tools compiled specifically for Android ARM64.
- Launching or switching to an installed IKEMEN Android application through a
  future Android intent/companion bridge.

### Missing or unavailable on Android until separately implemented

- The existing Windows `sprmake2.exe` and `sndmaker.exe` programs.
- Direct SprMaker2/SndMaker rebuilding from the browser-hosted extension.
- Running Windows batch files.
- The current desktop `child_process` IKEMEN launcher.
- Automatic Photoshop or Audacity desktop integration.
- Features requiring unrestricted desktop filesystem paths.

### Possible later Android additions

- Portable JavaScript SFF v2.1 and SND writers, removing the native builder
  dependency for supported operations.
- Android ARM64 builder binaries if suitable source, licensing, maintenance,
  and testing are available.
- An explicit Android bridge that launches the IKEMEN APK with a generated test
  configuration. This must be tested against the actual APK wrapper and cannot
  be represented as working before that bridge exists.

## iPhone and iPad

iOS should be treated as a browser/remote-workspace editor. IKEMEN itself does
not run on iOS, and the browser sandbox cannot launch native build tools.

### Expected editor features

- ZSS, CNS, AIR, DEF, CMD, and configuration syntax coloring.
- Code navigation, state/function lists, controller reference, snippets, and
  text-based audits.
- AIR animation and collision preview/editing when project files are available
  through the selected remote or virtual workspace.
- SFF sprite, axis, palette, layer, naming, and requirement inspection.
- SND group/index inspection, event names, validation, waveform display, and
  browser playback when supported by Safari/WebKit.
- Sound-profile, CommonFX, voice-contract, reference-scan, and build-manifest
  authoring.
- Generated reports and files saved through the workspace or browser-supported
  download mechanism.
- Remote repository editing through a compatible browser-hosted VS Code service.

Until the portable archive adapters are implemented, the SFF/AIR/SND preview
items in this target list remain plans rather than current browser features.

### Missing or unavailable on iPhone/iPad

- Running IKEMEN.
- Launching training mode or play tests.
- Executing SprMaker2, SndMaker, FFmpeg, Photoshop, Audacity, batch files, or any
  other native desktop program.
- Direct access to arbitrary iOS filesystem locations.
- Reliable integration with external applications beyond the browser's normal
  share/download behavior.
- Local Android-style command-line or intent bridges.

## Desktop features remain unchanged

Windows retains the complete extension, native builders, external image/audio
editors, and IKEMEN training launcher. Linux and macOS retain the portable
editor features; native build and launch actions depend on compatible tools for
their operating system. Mobile support must not reduce or silently alter the
desktop workflow.

## Guiding rule

The extension will advertise only capabilities verified on the active host.
Unavailable operations will be hidden or clearly disabled. Windows executables
will not be bundled as a mobile workaround because they cannot run on Android
or iOS.
