# JNP Public Release Workflow

`Complete Project` creates a separate public copy. It never cleans or crops the development game in place.

## 1. Capture the intended defaults

Set the development game to the exact public defaults first: keyboard and controller bindings; normal menu, menu-map, player, and submenu options; sound, voice, music, and visual options; and any other persistent choice stored by the game.

Run **Capture JNP Release Defaults**. The default snapshot includes persistent files under `save`, while excluding player-created palettes, logs, and replays. Add a file to `snapshot.sources` or `snapshot.runtimeResetFiles` when a project stores a persistent option elsewhere.

Recapture after an intentional default changes. Do not recapture merely because a developer changed a personal setting.

## 2. Review the release profile

Run **Open Public Release Profile**. Review `copy.include`, `copy.exclude`, cleanup paths, and every exact SFF entry. Set `reviewed` to `true` only after this review.

Every SFF must use one explicit strategy:

- `manifest-build`: rebuild from the authoritative uncropped source manifest. SprMaker2 autocrop is enabled only in the public copy.
- `verified-cropped`: a human has verified that this archive is already release-cropped and should be copied unchanged.

`unresolved` blocks release. A newly discovered SFF is added as unresolved rather than silently classified.

Generic extract-and-rebuild is prohibited because it can alter or lose indexed palette structure. Development source images stay uncropped.

## 3. Audit and complete

Run **Audit Public Release**. Completion is blocked when the snapshot is missing or changed, the profile has not been reviewed, a source manifest is unavailable, or any SFF lacks a decision.

Run **Complete Project into Public Copy** and choose a new folder outside the development game. The builder creates a staging copy, restores captured defaults, removes player-created palettes/logs/replays, crops approved SFF builds, writes a release receipt, and only then publishes the completed folder.

If a step fails, the development game remains untouched. The incomplete staging folder is retained with a failure note for diagnosis.

## Optional updater release artifacts

Automatic player updating remains deferred until public releases resume, but **Complete Project** can prepare its release-side inputs now. The `updater` section of the public release profile is disabled by default.

When enabling it, review `productId`, `displayName`, the three-part `version`, `channel`, permanent HTTPS `manifestUrl`, mirrors, preservation patterns, and the individual hosting asset-size ceiling. The placeholder `example.invalid` address intentionally blocks completion.

## Finished-product display version

The release profile registers each motif `system.def` that should display the
game version. Finish Product writes the reviewed label to
`[Title Info] footer.version.text` in the completed copy, including patched
version builds. The development motif remains untouched.

The suggested value advances by one tenth: `1.0` becomes `1.1`, and `1.9`
becomes `2.0`. The author may replace that suggestion with another number or a
named release, then edit the exact player-facing text before confirming the
build. A successful build stores that choice as the baseline for the next
release. This display label is separate from the updater's required three-part
machine version.

An enabled Windows build creates a separate `<Public Copy>-Release-Artifacts` folder containing:

- `update-manifest.json`, ready to publish at the configured permanent manifest address;
- a complete ZIP of the clean public copy;
- `SHA256SUMS.txt`;
- upload instructions.

The public copy receives `IKEMEN-UPDATE-MANIFEST.json`. Every shipped file is hashed and labeled `managed` or `preserve`. Files unknown to the manifest are always preserved. A reviewed `previousManifest` may produce an exact removal list containing only paths that the previous manifest owned as `managed`.

If the full ZIP reaches `maximumAssetBytes`, completion stops rather than generating an upload that the configured host cannot accept. Split and incremental packages remain part of the later player-updater phase. See `Notes/HDBZ/HDBZ_RELEASE_UPDATER_DEFERRED_PLAN.md`.

## SFF viewer crop

**Crop SFF** offers current sprite, current group, and all-sprites scopes. It uses the same authoritative manifest and palette-preserving SprMaker2 rebuild. It does not crop the source PNG files, and it does not replace the SFF until the rebuilt archive succeeds. This is a deliberate manual/pre-release tool; normal development saves never invoke it.
