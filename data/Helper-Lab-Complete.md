# Helper Lab

Helper Lab is IKEMaker's visual workspace for creating, inspecting, connecting, and safely revising IKEMEN helpers. It supports ZSS and CNS without hiding the generated code.

## Start safely

- **Fireball** and **Super Fireball** are complete, editable gameplay starting points. They include creation, exact instance capture, owned StateDef behavior, velocity, collision-dependent attacks, hit counting, and cleanup.
- **Built-in scaffolds** cover visual followers, companions, input readers, hitbox proxies, and effect emitters. They establish identity, ownership maps, and cleanup, but intentionally leave game-specific behavior to the author.
- **Project recipes** store reviewed helper plans in `.ikemen-tools/helper-recipes`. Loading one changes only the lab preview. It never inserts code.
- **Use unused suggestion** checks connected source files for occupied static helper IDs and StateDefs. It is a convenience, not a replacement for project numbering rules.

## Visual projectile review

When a Fireball recipe points to a valid AIR action and SFF sprites, the canvas shows the sprite, Clsn1, Clsn2, spawn point, and projected velocity path. Animation begins stopped. Use Play or single-tick arrows when needed. The mouse wheel zooms and dragging pans the canvas.

Readiness checks report missing AIR actions, missing sprite references, missing attack collision, and optional hurt collision before code insertion.

## Existing helpers

The Helper Tree scans every connected ZSS/CNS file, nests helpers under the StateDef that creates them, and reports missing StateDefs, missing cleanup, recursion risk, duplicate IDs, and computed IDs.

Select a static helper and choose **Load into editor** to round-trip its creation parameters. **Update existing controller** replaces only the isolated creation controller as one undoable VS Code edit (your Auto Save setting still applies). The owned StateDef is never rewritten because it may contain hand-authored behavior. Computed helper IDs remain inspection-only.

## Maps and data flow

Map & Data Flow lists detected reads and writes, shows their files and lines, and generates explicit self, parent, root, helper, PlayerID, or team contracts. Use PlayerID for one exact runtime instance; a family ID may identify multiple helpers.

## Insertion and recovery

- **Insert all at cursor** inserts the displayed code into a selected connected source.
- **Insert spawn + state** adds both pieces as one coordinated, undoable workspace edit (your Auto Save setting still applies).
- Existing-controller updates are modal and replace only the parsed source range.
- Review every edit in the normal text editor. VS Code Undo remains available until the document is saved.

## Connected workspaces

Helper Lab bridges to Move Lab, HitDef Editor, Position & Camera, Explod Composer, the controller browser, the full character dependency tree, and the standard game launch controls. Use those focused workspaces for detailed combat, spatial, resource, and runtime testing.

## Static-analysis boundary

The tree and data-flow views analyze connected source code. Dynamic IDs, computed redirections, runtime-created descendants, engine-side state, and gameplay outcomes still require an IKEMEN test. Helper Lab labels these boundaries instead of presenting guesses as facts.
