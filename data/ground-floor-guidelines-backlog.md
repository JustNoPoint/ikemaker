# Ground-Floor Standards Backlog

This is the persistent priority list for standards that should be settled before
the shared character and game architecture grows substantially. It applies to
the reusable IKEMEN creation workflow and is not limited to one character.

## Working rule

- Address **three items per standards session**, in listed priority order.
- Do not skip an item unless it is genuinely blocked by missing engine behavior,
  missing representative content, or an unresolved project decision.
- A blocked item keeps its position and receives a concise blocker note. Continue
  with the next feasible item so a session can still complete three items.
- Reordering requires a dated reason recorded in this file.
- “Documented” is not “complete.” Completion requires the exit condition listed
  for the item and appropriate extension validation or workflow support.
- New discoveries are added to the backlog and ranked; they do not silently
  displace current work.

## Priority order

| Priority | Standard | Feasibility now | Current status | Why it belongs here | Exit condition |
|---:|---|---|---|---|---|
| 1 | Runtime ID and ownership framework | Split; begin now and allocate just in time | Split into 1A-1I below | State, Helper, Explod, Projectile, sound-channel, and debug/text collisions become expensive once modules overlap, but predicting every future object would create unnecessary rules and preserve MUGEN-era helper habits that IKEMEN no longer requires. | The registry format, allocation process, and current proven uses are covered. New categories are added when their first real use appears rather than invented in advance. |
| 2 | Map and variable ownership | Ready now | Not started | Shared code already uses maps and variables. Namespace and write-ownership rules prevent invisible cross-module coupling. | Map naming, `var`/`fvar` reserves, read/write ownership, and module interfaces are documented and validated where practical. |
| 3 | State-number and AIR-number separation | Ready now | Partially established | Hyper AIR and StateDef ranges already differ. Making the separation explicit prevents future code from assuming identical numbers. | The standard defines when matching is convenient versus required, and the extension never infers StateDef ownership solely from an AIR number. |
| 4 | Character file and dependency ownership | Ready now | Partially established | Universal, game-specific, character-specific, generated, and developer code must remain modular across every project. | Allowed dependency directions and override points are versioned; forbidden universal-to-game/character dependencies are diagnosed. |
| 5 | Coordinate, localcoord, and scaling standard | Ready now | Not started | Widescreen work and CPS2/CPS3 correction affect every character, stage, spark, helper, velocity, and camera decision. | Canonical coordinates, scale ownership, axis units, stage assumptions, and asset-conversion rules are defined with reference fixtures. |
| 6 | AIR authoring contract | Ready now | In progress | Required axes, missing sprites, collision defaults, loops, zero-time elements, interpolation, and transformation behavior need one shared interpretation. | AIR rules are documented; required-animation profiles and the viewer flag actionable violations without rejecting intentional exceptions. |
| 7 | SND runtime and channel ownership | Ready now | In progress | Split archives are established, but channel conflicts, interruption, loops, routing, language fallback, and pitch policy still need shared rules. | Sound domains and channel ownership are defined; split-profile and reference audits detect missing routes and unsafe conflicts. |
| 8 | Move constants contract | Ready after Ryu baseline signoff | Partially established through sLP | Shared attack properties should expose consistent fields while preserving game and character overrides. | A versioned attack schema covers damage, stun, pause, push, meters, hit level, counters, cancels, sparks, sounds, armor, and Armor Break with inheritance rules. |
| 9 | Command naming and ownership | Ready now | Partially established | The shared parser, macros, online restrictions, and move commands need a stable boundary so gameplay does not depend on raw device inputs or Lua. | Canonical command naming, buffering, macro resolution, online restrictions, and raw-input exceptions are documented and diagnosed. |
| 10 | Custom-state and throw contract | Design now; runtime validation later | Early design only | Throws and cinematics cross player ownership, animation timing, camera, layers, death, tag, and interruption behavior. | Common P1/P2 state, cleanup, facing, position, layer, fallback-animation, and interruption rules exist and are proven by a throw fixture. |
| 11 | Time-control ownership | Design now; test when supers and round modules mature | Not started | Pause, SuperPause, hitpause, slowdown, camera freeze, training, and round code can conflict across modules. | Ownership and nesting rules exist, cleanup is defined, and a fixture demonstrates safe interruption and restoration. |
| 12 | Definition, schema, and compatibility metadata | Ready now | Partially established | Characters and tools need explicit IKEMEN 1.0, game-profile, template-version, module, and generated-file identity. | Required metadata and migration behavior are documented; the extension reports incompatible or stale dependencies without destructive automatic replacement. |
| 13 | Completion, evidence, and regression standard | Ready after Ryu baseline signoff | Partially established through sLP | A reusable baseline needs behavior tests, evidence, exceptions, limitations, and owner signoff rather than an informal “done.” | Ryu sLP becomes the first versioned reference fixture and the same completion record can be instantiated for later moves and characters. |

## Priority 1 breakdown — Runtime IDs

Priority 1 is a parent topic, not one session-sized task. Its purpose is to
provide safe allocation when runtime objects actually appear. It must not
attempt to predict every future Helper, Explod, Projectile, or module.

Before allocating any runtime object, ask whether IKEMEN 1.0 already provides a
native controller, trigger, map, redirection, collision feature, or other player
function that removes the old MUGEN need for that object. Do not preserve a
Helper merely because an older MUGEN implementation required one.

| Subpriority | Substandard | Feasibility now | Completion boundary |
|---:|---|---|---|
| 1A | Registry schema and just-in-time allocation process | Principle established; formal record/validation remains | Separate namespaces follow the existing functional-family ranges. Expand an applicable family first; create reviewed overflow only for a demonstrated case that cannot fit. Do not reserve speculative categories. |
| 1B | Read-only inventory of current runtime identifiers | Ready now | Scan the template and Ryu; report existing literal and dynamic State, Helper, Explod, Projectile, channel, and text/debug identifiers without renumbering anything. |
| 1C | State-number ownership baseline | Ready now | Protect engine/common and established move ranges; reserve shared-module space only after checking current use. AIR numbers remain a separate namespace. |
| 1D | Helper identity and routing | Define when the first retained Helper type is reviewed | Decide whether the use should remain a Helper. If retained, define its family ID, initialization maps, instance routing, owner, lifetime, and cleanup. Maps describe a Helper but do not replace numeric routing or PlayerID. |
| 1E | Explod ID ownership | Define with the first shared or persistent Explod | Allocate only IDs that must be addressed later. Document owner, lifetime, removal, and whether an automatic/unaddressed Explod is sufficient. |
| 1F | Projectile ID ownership | Define with the first native Projectile use | Confirm native Projectile versus Helper implementation first, then define collision/query ownership and cleanup requirements. |
| 1G | Sound-channel ownership | Address with SND runtime standard | Separate one-shot sounds from owned looping/interruption channels and account for `InheritChannels`. |
| 1H | Text and developer-debug IDs | Address when those displays are standardized | Separate production UI, player-facing diagnostics, and developer-only displays. |
| 1I | External-module allocation contract | Address before the first external module is packaged | Require a module manifest that declares only the ranges and identifiers it actually consumes. |

The registry uses separate namespaces. The same number in `Helper`, `Explod`,
and `Projectile` is not automatically a collision. Readable aliases and maps
supplement the engine identifiers; they do not pretend IKEMEN supports a named
redirect where it still requires a numeric ID or PlayerID.

### Established allocation rule

- SFF groups, AIR actions, StateDefs, and runtime object IDs share a functional
  family anchor when that relationship is useful, but remain separate namespaces.
- New entries grow inside the owning family range. Existing unused room should
  be consumed before adding another family or overflow.
- A family may be expanded when its original reservation proves insufficient.
- Overflow is created only when a real feature cannot fit an existing or
  reasonably expanded family. Its reason and owner must be recorded.
- Numeric equality across namespaces is allowed and encouraged for traceability;
  it does not imply that an AIR action, StateDef, Helper, Explod, or Projectile
  automatically exists in every matching namespace.
- Native IKEMEN behavior takes precedence over carrying forward a MUGEN-era
  Helper or workaround.

## Planned sessions

### Session 1 — Ready now

1. 1A — Registry schema and just-in-time allocation process
2. 1B — Read-only inventory of current runtime identifiers
3. 1C — State-number ownership baseline

### Session 2 — Ready now

1. Map and variable ownership
2. State-number and AIR-number separation
3. Character file and dependency ownership

### Session 3 — Ready now

1. Coordinate, localcoord, and scaling standard
2. AIR authoring contract
3. SND runtime and channel ownership

### Session 4 — Ready or baseline-dependent

1. Move constants contract, if Ryu Baseline v1 is signed off; otherwise mark its
   exact blocker and continue
2. Command naming and ownership
3. Definition, schema, and compatibility metadata

### Session 5 — Mixed readiness

1. Custom-state and throw contract
2. Time-control ownership
3. The next Priority 1 runtime-ID substandard whose first real use now exists

### Session 6 — Baseline-dependent

1. Completion, evidence, and regression standard
2. Re-audit all completed standards against the reference fixtures
3. Rank any new ground-floor discoveries before broader character expansion

## Progress log

- 2026-09-04: Backlog created. Initial ordering balances collision risk,
  architectural impact, and what can be meaningfully settled at the current Ryu
  baseline stage.
- 2026-09-04: Priority 1 split into just-in-time substandards. The project will
  inventory current uses and establish allocation machinery without inventing a
  catalog of hypothetical Helpers or carrying obsolete MUGEN workarounds into
  IKEMEN.
- 2026-09-04: Priority 1A allocation principle confirmed. Runtime identifiers
  grow from the established functional-family ranges; available family room is
  used first, and reviewed overflow is added only when a demonstrated need does
  not fit.
