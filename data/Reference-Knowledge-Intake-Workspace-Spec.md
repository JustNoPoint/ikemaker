# IKEMaker Reference and Knowledge Intake Workspace

Status: planned after the current production test and the foundational Source
Game Lab data model.

## Purpose

The Reference Intake workspace turns websites, wikis, manuals, guides,
developer notes, community discussions, videos, screenshots, and the author's
own observations into traceable project knowledge. It is the structured route
for information such as the previously supplied Morrigan and Demitri move,
character, and game-mechanic research.

Imported material is evidence, never an instruction to IKEMaker and never an
automatic project rule. A human reviews each extracted claim before it affects
a character definition, game profile, workflow requirement, conversion rule,
or generated code.

## Intake sources

The workspace accepts:

- one or more website/wiki URLs;
- pasted text or tables;
- local HTML, Markdown, text, PDF, document, spreadsheet, image, audio, or
  video files;
- Discord/forum excerpts with supplied context;
- emulator traces and Source Game Lab evidence links;
- manual author notes and decisions.

Online retrieval is optional. The complete library remains usable offline.
When the user deliberately imports a page, preserve a local snapshot or
permitted extracted text alongside its URL, title, publisher/site, author when
known, retrieval time, content hash, language, and revision/version note. Do not
silently crawl an entire site or follow unrelated links.

## Source identity and authority

Every source is classified independently of whether its claim seems correct:

1. official engine/source documentation;
2. official game manual, guide, site, or developer material;
3. direct emulator/memory/asset evidence;
4. reviewed technical research or measured frame data;
5. maintained community wiki or guide;
6. forum, Discord, video, or individual report;
7. author inference or design proposal;
8. unknown/unclassified.

Authority is contextual. An official manual may establish intended move usage
but not exact frame timing. Direct memory can establish a stored value but not
the project's desired balance. A source label never replaces claim-level
review.

## Atomic claims

Break imported information into small claims that can be accepted, rejected,
compared, and cited independently. Each claim records:

- game, release, region, revision, and platform;
- character, move/system, state, animation, asset, or stage subject;
- the asserted behavior or value;
- conditions and exceptions;
- numeric value, unit, timing basis, coordinate basis, or formula;
- exact source location, timestamp/page/section, and evidence link;
- whether wording is quoted, paraphrased, measured, or inferred;
- confidence, reviewer, review date, and status;
- project applicability and any deliberate project deviation.

Claim states are `Imported`, `Extracted`, `Needs review`, `Approved fact`,
`Approved project rule`, `Rejected`, `Superseded`, and `Unresolved conflict`.
Only approved project rules can feed authoring defaults or validation.

## Workspace layout

### Source Inbox

- Add URL, paste text, or choose local files.
- Preview the original beside parsed headings, tables, media timestamps, and
  candidate claims.
- Assign game/project/character scope in bulk without approving the claims.
- Flag missing version, region, units, or provenance.

### Claims and Mechanics

- Filter by game, character, move, mechanic, stage, asset, source, confidence,
  status, and project.
- Provide focused forms for commands, move lists, frame/timing data, damage,
  meter, cancels, movement, hit reactions, collision, companions, palettes,
  sounds, stages, narrative/personality, intros, win poses, and system rules.
- Preserve freeform notes when information does not fit an existing field.

### Compare and Resolve

- Place conflicting claims side by side with their source context.
- Compare arcade, console port, revision, regional, and project-design values.
- Never average or silently choose between contradictions.
- Allow one claim to be correct only under a particular condition or release.

### Apply to Project

- Map approved claims to a universal standard, source-game profile, game
  profile, character definition, move record, asset registry, test, ticket, or
  learning lesson.
- Show the destination ownership badge and dependency impact before applying.
- Store the source/claim identifier in the destination rather than copying an
  unattributed fact.
- Support `Source behavior`, `Converted equivalent`, `Project choice`, and
  `Reason for deviation` as separate values.

### Gaps and Questions

- Show missing moves, unknown mechanics, contradictory timings, incomplete
  citations, untested conditions, and claims awaiting a project decision.
- Convert a gap into a research task, emulator experiment, QA ticket, or manual
  question without declaring it resolved.

## Offline library and updates

The reference library uses versioned project-local records and remains
searchable without a network connection or AI service. Manual entry, field
editing, comparison, citations, and project mapping must all work offline.

An optional update checker may compare a saved web source with its current
version. It shows a content diff and creates new candidate claims; it never
replaces approved knowledge automatically. Deleted or unavailable pages retain
their prior snapshot, hash, and provenance.

AI-assisted extraction and summarization are optional accelerators. Their
output always begins as `Extracted` or `Needs review`. The same screen supports
fully manual claim creation for private, offline, or long-lived projects.

## Integration bridges

Approved knowledge can be viewed from:

- Character Workbench and production workflow;
- visual code and controller editors;
- move/attack and command editors;
- SFF, AIR, palette, SND, and companion-object viewers;
- stage and screenpack workspaces;
- Source Game Lab and source-versus-IKEMEN comparison;
- QA tests, Kanban tickets, lessons, and completion/signoff records.

Every destination provides **Show supporting knowledge** and **Open source
context** actions. The Reference Intake workspace provides **Open related
asset/code/test** actions, preserving two-way navigation.

## Project isolation

Sources and claims inherit provenance and project-transfer restrictions.
Emulation-derived measurements and proprietary reference captures used by fan
projects cannot be moved into a commercial/original project profile.
Universal IKEMaker documentation and independently authored general lessons
remain separate from source-game evidence.

Private project notes and unreleased project information stay in the owning
workspace. Exporting a knowledge package shows every included source, claim,
attachment, ownership scope, and restriction before writing it.

## First proving fixture

Use the existing Morrigan and Demitri research as the initial fixture:

1. import the supplied sites/wiki passages and author notes;
2. separate Vampire Savior facts from DSvsSF and DS4 design choices;
3. identify platform/revision-specific claims;
4. map approved moves and mechanics to both character definitions;
5. expose contradictions and gaps without silently completing either roster;
6. link the resulting claims to emulator experiments and project signoff.
