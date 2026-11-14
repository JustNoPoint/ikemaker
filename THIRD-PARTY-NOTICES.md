# Third-party notices

## Elecbyte command-line build tools

This Windows package includes `sprmake2.exe`, `sndmaker.exe`, `sff2png.exe`,
and the original Elecbyte runtime files required by SprMaker2/SFF2PNG so SFF
and SND work can run offline without separate setup. These tools and runtime
files remain the property of their respective authors.

`MUGEN.exe` is not included. This package does not include IKEMEN GO or any
game, character, stage, screenpack, or commercial game asset.

## Lua Language Server

Clearly labeled Windows `With-LuaLS` bundles include the official, unmodified
`sumneko.lua` VSIX as a separate optional extension. Standard bundles omit it.
Both its VS Code wrapper and its Lua
language server are distributed under the MIT License. Their copyright,
permission, warranty, and bundled dependency notices remain inside that VSIX.

Source repositories:

- https://github.com/LuaLS/vscode-lua
- https://github.com/LuaLS/lua-language-server

## Bundled offline reference snapshots
The offline reference library contains attributed IKEMEN GO wiki documentation
(https://github.com/ikemen-engine/Ikemen-GO/wiki), MUGEN 1.1 documentation
(https://www.elecbyte.com/mugendocs-11b1/mugen.html), and the merged reference
(https://potsmugen.github.io/ikemen-merged-docs/). Original copyright notices
and original-source links are preserved. MUGEN documentation is copyright
Elecbyte; IKEMEN documentation belongs to its contributors. The manifest records
source URLs and capture date. Local copies have navigation/formatting changes
for offline reading; they are not an official documentation release.

## Shader Workshop

The bundled @webgpu/glslang 0.0.15 WebAssembly compiler is distributed with its license in bin/shader-compiler/LICENSE.txt (https://github.com/KhronosGroup/glslang). The sprite fragment templates include MIT-licensed IKEMEN GO shader code and carry the upstream copyright notice (https://github.com/ikemen-engine/Ikemen-GO).

Windows OpenGL validation uses Khronos glslangValidator 11.7.0 distributed by glslang-validator-prebuilt-predownloaded 0.0.2. Its license accompanies the compiler.
