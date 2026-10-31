# Media editor input defaults

AIR and SFF canvas wheel zoom is pointer-anchored. Ctrl+wheel / trackpad pinch uses bounded continuous scaling and does not zoom the entire webview. With the canvas focused, `+`, `=`, `-`, and keypad `+` / `-` zoom around the canvas center. Form controls retain their normal keys.

In AIR, SFF, and SND, Shift+wheel steps only a focused editable numeric field. Browser-native stepping respects min, max, and step. Empty fields and `step="any"` are untouched. Both input and change handlers receive actual changes, so existing preview/save behavior still applies.

Palette Workshop sprite right-click opens color selection and exact authored-palette selection. Opening the menu does not paint. Color selection uses the existing picker event; palette selection uses the existing guarded palette selection route. Palette switching is unavailable for stale evidence, unresolved authored palettes, or a retained palette draft. It does not rewrite a sprite's palette assignment or claim to resolve runtime RemapPal.

SND metadata sorts are ascending, with physical archive position as a stable tie-breaker and unavailable values last. Stored WAV size is distinct from decoded PCM data size. Text, marked-only, quality, and file filters remain active; sorting retains the selected sound.

Existing context-specific list navigation and reorder shortcuts are unchanged. A shared user-configurable navigation/reorder scheme is deferred: AIR collision editing, SFF layer/axis editing, and list reordering have different key ownership and mutation contracts.

## Animated WebP capability

Animated WebP export is not available in the bundled toolchain. The shipped native tools are SFF/SND builders/readers, not a WebP encoder. The optional user-configured FFmpeg command is not a bundled or deterministic capability. AIR PNG sequence export plus timing/identity manifest remains available; no new encoder dependency is installed or silently assumed.
