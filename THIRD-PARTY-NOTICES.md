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

## Ikemen Media Editor

IKeMaker's sound loudness processing adapts the linked envelope and K-weighted loudness implementation from Ikemen Media Editor by PotS. [Upstream source](https://github.com/potsmugen/ikemen-media-editor/tree/41f2ac3538cd6a62e533aae26afe02647270f792)

MIT License

Copyright (c) 2026 PotS

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
