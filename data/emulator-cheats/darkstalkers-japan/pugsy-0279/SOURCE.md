# Japanese Darkstalkers MAME Cheats

Downloaded: 2026-09-08

Upstream release: Pugsy XML/JSON Cheat Collection for MAME 0.279, released
2025-07-27.

Upstream release page: <https://www.mamecheat.co.uk/>

Download mirror used after the upstream server rejected this machine's TLS
connection: <https://www.t2e.pl/t2e-download/pugsy-cheat-list.508>

Downloaded ZIP SHA-256:
`ADFCAA8BC7168039C25D50876BB25B3E506B79D7F6E13C967E3350E75999E750`

Contained `cheat.7z` SHA-256:
`FA979A25C0C9DB737A75B60F4EE2AB698BF8D8C2BC1FC44A7362467ED941E7DF`

## Included Japanese arcade sets

| File | Game/set role | Cheats | SHA-256 |
|---|---|---:|---|
| `vampj.xml` | Vampire: The Night Warriors, Japanese set | 18 | `B835DE2C803379C9B60EA2673A222D4E693C03CD9CC6DC6E1356BBC5F50EBCF5` |
| `vhuntj.xml` | Vampire Hunter, Japanese set | 36 | `5A1915F1B9ABBAC2B36A4400BBDBA6472F55BE9A338D878641640B2773684CF2` |
| `vsavj.xml` | Vampire Savior, Japanese set | 25 | `5BE76AA1EF3CABC9633CCF5C0E14F0779E86E6DFBCB65F6C6BCE195497B1DD38` |
| `vhunt2.xml` | Vampire Hunter 2, Japanese release | 34 | `E6410E72C0AA6B1CC3325EE21FC040501016DD76CDC855CFB5913D3447D367C7` |
| `vsav2.xml` | Vampire Savior 2, Japanese release | 36 | `FDE16061EE632EABC48925A5EA96585BE8101B75440FB8D2EC624A65376819FF` |

These files were extracted from the verified 0.279 package rather than copied
from a rolling mirror's unpacked inventory.

## Use in MAME

Either place the desired XML files in MAME's configured `cheat` directory or
use the complete upstream `cheat.7z`. Enable MAME's cheat and cheat-finder
plugins. File names must match the ROM short names shown above.

Addresses are ROM-set-specific. IKEMaker must check the exact short name and
revision before enabling or importing an entry.

## Debug-test warning

The normal `vampj.xml` from Pugsy 0.279 does **not** contain the separately
documented hidden Character Test / Animation Frame Sweep cheat. That cheat must
be acquired and tracked as an additional `vampj` Euro/Japanese-revision-aware
research cheat; it must not be inferred from this file or copied to the other
four games without verification.

