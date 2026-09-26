# Learning / Advanced Semantic Equivalence

Baseline: IKEMEN 1.0.

Learning and Advanced are presentation profiles. They may change disclosure,
teaching comments, default-expanded reference sections, recommendation order,
and shortcut density. They must not silently change selected project values,
native controller fields, save authority, validation, backups, stale-file
checks, mutation history, or rollback guidance.

## Executable evidence

`test/experience_equivalence.test.js` verifies:

- all workspace descriptors retain the same workspace, domain, and ownership
  title across modes;
- all 155 ZSS controller completion snippets normalize to the same native block;
- reviewed controller insertion preserves the same selected options and values;
- ZSS and Lua completion labels/call syntax are identical;
- hover title, summary, and official source remain identical;
- character creation exposes the same explicit Guided and Clean choices, with
  only recommendation order changing;
- every Advanced shortcut targets a control already present in the ordinary
  workspace rather than a second mutation path.

`test/direct_write_authority.test.js` separately audits direct write ownership.
Mutation, stale-file, backup, history, and transactional tests apply regardless
of experience because those operations do not accept experience as an input.

## Allowed authored-text difference

The reviewed controller wizard may add explanatory `#` comments in Learning.
The equivalence test strips comments and proves that the controller name,
selected fields, expressions, and terminators are otherwise identical.

Character scaffold style is not inferred from experience. The user explicitly
selects Guided or Clean. Experience affects which choice appears first and is
labeled recommended; the chosen style alone controls generated content.

## Extension rule

Any future Learning/Advanced branch that can reach a project mutation must add
an equivalence test proving identical reviewed input produces identical native
semantics and uses the same safety path.
