# ZSS learning criteria

IKEMaker supports recognition-first learning. The author does not need to begin
from a blank file or memorize every opening keyword, brace, option, or argument
before doing useful work.

## Daily topic rhythm

A daily topic may be either:

- one state controller and its available options; or
- one ZSS structure, expression, function form, loop, or reusable safety
  pattern.

The topic should explain its syntax, purpose, common uses, important limits,
and a real project example when one exists. Daily topics may be combined with
ongoing research and current project work.

An exercise is optional. Reading, discussing, and mentally collecting ideas
and use cases is legitimate progress. Do not invent gameplay edits merely to
prove that a topic was read.

## Learning states

- **Introduced** — the topic and its purpose have been presented.
- **Reviewed** — the author has read or discussed its syntax and use cases.
- **Recognized** — the author can identify it in project code.
- **Applied naturally** — the author used or modified it during real work.
- **Comfortable explaining** — the author can describe the important behavior
  in their own words.
- **Needs revisiting** — the topic should return when a useful context appears.

These are observations, not mandatory gates. Production approval and learning
progress remain separate decisions.

## Authoring criteria

- Provide a valid starting structure instead of requiring syntax recall.
- Use searchable, grouped catalogs comparable to the State Controller list.
- Keep complete language capabilities available; do not hide loops or functions
  behind an artificial learning sequence.
- Let the current code determine what is studied next.
- Prefer bite-sized blocks with one clear responsibility when that preserves
  execution order and ownership.
- Keep related logic together when splitting it would make behavior harder to
  trace.
- Prefer small named functions for genuinely reusable or isolatable behavior,
  not merely to move complexity elsewhere.
- Preserve straightforward exceptions without turning every shared function
  into a large switchboard.
- Comment intent, ownership, contracts, and unusual decisions rather than
  restating obvious syntax.

## IKEMaker assistance contract

The ZSS Structure & Logic catalog should supply correct opening syntax,
punctuation, indentation, and matching braces. Tab stops guide the author
through meaningful gaps. With selected complete lines, supported structures
wrap the selection while preserving relative indentation and comments.

The catalog complements understanding; it does not silently invent game rules,
map names, function ownership, or controller values.
