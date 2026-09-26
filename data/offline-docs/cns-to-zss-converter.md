# Reviewed CNS to ZSS conversion

IKEMaker can convert one legacy CNS state file or every CNS state file assigned
through a character DEF's `st`, `st1`, `st2`, and related entries.

The converter preserves the original CNS files. It translates StateDefs,
controllers, parameters, comments, trigger groups, `triggerall`, `persistent`,
and `ignorehitpause` into native IKEMEN 1.0 ZSS. Conditions sharing one trigger
number remain AND conditions; different trigger numbers remain OR alternatives.

## Mixed constants and state files

Older characters may assign one CNS file as both `cns =` and `st =`. IKEMaker
converts only its StateDef and State sections. Data, Size, Velocity, Movement,
Quotes, and other non-state sections are omitted from the ZSS and reported for
review. The original CNS remains assigned through `cns =` so those constants
are retained. A constants-only CNS is not convertible and is blocked.

## Review levels

- **Converted structure** means the syntax and trigger grouping were translated.
- **Review** means the output is available but compatibility behavior still needs
  human or runtime verification.
- **Unsupported** blocks saving or applying the conversion.

Redirected controllers using `ignorehitpause`, unknown controllers, unknown
parameters, duplicate parameters, malformed lines, and dynamically calculated
timing flags are explicitly reported. IKEMaker does not silently invent a
replacement.

## Applying a conversion

Use **IKEMEN: Convert CNS State Code to ZSS** for one file or **Convert a
Character's CNS State Files to ZSS** for a DEF-driven batch. Review the CNS and
ZSS panes, inspect every finding, then either save the ZSS without changing the
character or save all ZSS files and update only the DEF's state assignments.

All writes use stale-source checks, optional backups, mutation history, and the
Recovery Center. The original CNS files are never deleted automatically.
