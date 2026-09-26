# Visual code structure workspace

The visual workspace is a companion to normal text editing, not a replacement.
It recognizes StateDefs, ZSS functions, conditions, loops, controllers,
assignments, Lua functions, callbacks, tables, imports, and nested blocks.

- Select a card to reveal its source line.
- Expand **What is this?** for a plain-language explanation.
- Search or filter without modifying the file.
- Collapse broad states/functions while learning one nested block at a time.
- Lua cards show a rollback boundary badge. This is guidance, not proof of
  network safety; unknown match-time Lua must be reviewed.

The parser is deliberately tolerant of incomplete code so it remains useful
while authoring. The engine remains authoritative for syntax and runtime
behavior.

