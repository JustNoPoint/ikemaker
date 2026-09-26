# Map Registry authoring scope

This feature exists to replace memorization with recognition. It does not ask a
coder to remember hundreds of exact map names or begin from a blank text file.
The exact source name remains authoritative while IKEMaker supplies grouped
browsing, search, contract reminders, existing examples, and safe insertion.

## Shared information layers

1. Collection records literal occurrences, access type, source location,
   observed assignments, and clearly associated comments.
2. Meaning presents authored notes and provenance. Unknown ownership, runtime
   receiver, units, lifetime, and reset behavior remain Unknown until authored.
3. Presentation supplies a remembered grouped picker, Recent selections, full
   browser, hover, completion, and field-specific insertion adapters.

Underscore and dot segments create suggestions only. Future explicit annotations
and user-defined grouping rules must outrank these suggestions without changing
the underlying map name.

Confirmed prefixes use Author > Game > remaining categories: JNP > DvS,
JNP > SF6, JNP > DS4, and TeamZ2 > HDBZ. A resolved game filters out confirmed
namespaces belonging to other games. Unnamespaced entries are included only
when they occur in the resolved project's own indexed files or explicit
dependencies. An unresolved game yields no insertion/completion inventory.

## Enabled destinations

- Native ZSS/CNS text editors, including compatible CMD/ST documents using the
  registered CNS grammar.
- Ordinary text tabs containing `.zss`, `.cns`, `.cmd`, `.st`, `.inp`, or `.jnp`
  code. Generic `.txt` files require an explicit local-workspace choice of ZSS
  or CNS; unclassified `.txt` notes remain excluded.
- Verified visual fields in Helper Lab, Universal HitDef, JNP Move Constants,
  and Spatial Composer. Coverage is field-specific: Helper map names, map tables,
  guards/values/triggers; HitDef expressions; connected ZSS code and CNS
  expressions; and Spatial trigger expressions.

## Deliberate exclusions

- AIR/CLSN, SFF, SND, animations, palettes, sounds, numeric asset fields,
  search/filter controls, filenames, prose, notes, dialogue, and read-only
  previews.
- Other visual planners, including Move Lab and Throw Creator, until they expose
  a real editable code/expression destination with an explicit adapter. Stage
  or screenpack fields remain excluded unless a future adapter identifies an actual
  compatible code grammar.
- Lua until its map operation and destination grammar have a separately tested
  adapter.

## Safety contract

Browsing is read-only. Before an insertion, IKEMaker captures the exact source
and destination. Text documents must retain the captured version. Visual fields
must still exist and retain the captured value. Failed revalidation makes no
change. Successful edits use the normal text Undo or existing visual draft and
Apply workflow.

The captured destination also owns the registry scope. Tab changes during a
picker, text-grammar prompt, Existing Use navigation, or browser refresh do not
retarget collection to whichever editor later becomes active. Collection and
insertion use the same extension/grammar policy, including plaintext-opened ZSS
files and only those generic TXT files explicitly opted into code handling.

The collector is bounded and reports incomplete scope. A missing writer means
only that none was observed in the indexed scope; it is not proof that no writer
exists at runtime.
