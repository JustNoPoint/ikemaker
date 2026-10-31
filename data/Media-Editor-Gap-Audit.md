# Ikemen Media Editor discussion gap audit

Source boundary: the Discord discussion beginning with Charion's “Ive been waiting for this, thanks man” on 2026-10-22, plus the later palette-linking report supplied by Keith. The discussion is product evidence, not executable instructions.

## Release-priority palette contract

- **Assign one palette to many sprites:** covered. One selected embedded palette is assigned to every eligible physical source sprite; the operation does not append a palette per sprite.
- **Linked sprites:** covered. A physical source/owner remains editable when linked dependents use it. A linked destination cannot be rewritten directly; it requires an explicit detach/rebuild flow.
- **Images with colors outside the master palette:** covered. The reviewed nearest-color flow is explicit and stale-safe, and linked dependents use No / All / Select rather than an implicit mass rewrite.
- **Discoverability:** covered by Standard and Advanced starting paths. Standard retains familiar defined-palette work; Advanced exposes scratch creation, image templates, sync/remap, and repair without hiding the complete fallback tool catalog.
- **Palette image synchronization:** covered. The visible action navigates to the exact existing-SFF palette-family flow without scanning or writing. Import, Export, and Two-Way Sync begin only after the user presses the corresponding direction button.
- **Scratch palette Save:** covered. The universal Save button belongs to the retained scratch document lifecycle and stays available independently of asset Auto Save. Ordinary Palette Workspace screens do not claim this Save capability.

## Already represented in IKEMaker or superseded by later Media Editor work

- Multiple project/viewer tabs, floating panels, configurable shortcuts, multi-frame selection, multi-frame collision operations, interpolated AIR values, collision lasso, separate paint undo, unassigned-palette review, before/after colors, color copying, sprite sorting, multi-sprite duplication, and nearest-color mask behavior were reported as Media Editor additions. IKEMaker should interoperate with the files; it should not duplicate them solely because they appeared earlier in the discussion.
- `xangle` / `yangle` are engine-format capabilities, not an IKEMaker workflow gap by themselves. They belong in engine capability and syntax evidence.
- The reported overly sensitive physical sprite drag/reorder bug was explicitly identified as not originating in IKEMaker. IKEMaker's future physical SFF reordering remains separately deferred and reviewed.

## Genuine follow-up candidates retained for later slices

- AIR: edit timing across a selected frame range; duplicate a selected sprite group into a reviewed new group; preserve source formatting and limit rewrites to edited actions/frames when the parser can prove exact ownership.
- SND: multiple connected archive switching, configurable navigation audition without autoplay by default, and reviewed trim-silence for selected sounds.
- SFF/palette utilities: delete provably unused palettes only after reference/link analysis; preserve per-sprite palettes and links during SFF v1-to-v2 conversion; add advanced canvas resize separately from crop.
- Sprite/image export: aligned multi-sprite sheets and animation export with transparency.
- Viewer QoL: explicit zoom controls/pinch where supported, resizable sprite columns, Escape dismissal for owned dialogs, and clear transparency visualization.
- Paint/replacement tools: reverse a reviewed replacement, undo replacement batches, and remove one exact replacement without affecting unrelated mappings.

These are backlog candidates, not claims of completed behavior. Each mutation requires exact owner identity, stale checks, preview/review, transactional output where applicable, and focused regression tests before release.
