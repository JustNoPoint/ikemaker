'use strict';
/* MIT License

Copyright (c) 2016 Suehiro
Copyright (c) 2018 K4thos, NeatUnsou, ShinLucho
Copyright (c) 2019 Daniel Porto, Gacel, Nikolay Griva
Copyright (c) 2020 Wintermourn
Copyright (c) 2021 Amavect, BwdYeti, Eiton, Super, two4teezee
Copyright (c) 2022 fantasma, GaryCXJk, PotS, Sam Hocevar, Wreq!
Copyright (c) 2023 Foobs, RollinJay, Wftk, wily-coyote
Copyright (c) 2024 Jesuszilla, Kasasagi, Orange-Dolphin, Rakíel
Copyright (c) 2025 Alceris, Kase, Leon Kasovan
Copyright (c) 2026 Kokorz
Copyright (c) 2016-2026 Ikemen GO contributors

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

The MIT License applies to the Ikemen GO engine and the scripts in this repo.

----------------------------------------------------------------------------

以下に定める条件に従い、本ソフトウェアおよび関連文書のファイル（以下「ソフトウェア」）
の複製を取得するすべての人に対し、ソフトウェアを無制限に扱うことを無償で許可します。
これには、ソフトウェアの複製を使用、複写、変更、結合、掲載、頒布、サブライセンス、および
または販売する権利、およびソフトウェアを提供する相手に同じことを許可する権利も無制限に含まれます。

上記の著作権表示および本許諾表示を、ソフトウェアのすべての複製または重要な部分に記載するものとします。

ソフトウェアは「現状のまま」で、明示であるか暗黙であるかを問わず、何らの保証もなく提供されます。
ここでいう保証とは、商品性、特定の目的への適合性、および権利非侵害についての保証も含みますが、
それに限定されるものではありません。 作者または著作権者は、契約行為、不法行為、またはそれ以外であろうと、
ソフトウェアに起因または関連し、あるいはソフトウェアの使用またはその他の扱いによって生じる一切の請求、損害、
その他の義務について何らの責任も負わないものとします。

----------------------------------------------------------------------------

Work contributed to Ikemen GO by various artists is licensed under a Creative Commons Attribution 3.0 Unported License.
http://creativecommons.org/licenses/by/3.0/deed.en_US
The license applies to following assets:
- The "default-3x5" font by Gacel.
- The icon/logo of the engine by Cylia Margatroid.

----------------------------------------------------------------------------

On release builds the engine is packed with more assets that could have different licences.
If you are using a release build check the "ScreenpackLicence.txt" file for more info.
*/
module.exports = '/* MIT License\n\nCopyright (c) 2016 Suehiro\nCopyright (c) 2018 K4thos, NeatUnsou, ShinLucho\nCopyright (c) 2019 Daniel Porto, Gacel, Nikolay Griva\nCopyright (c) 2020 Wintermourn\nCopyright (c) 2021 Amavect, BwdYeti, Eiton, Super, two4teezee\nCopyright (c) 2022 fantasma, GaryCXJk, PotS, Sam Hocevar, Wreq!\nCopyright (c) 2023 Foobs, RollinJay, Wftk, wily-coyote\nCopyright (c) 2024 Jesuszilla, Kasasagi, Orange-Dolphin, Rakíel\nCopyright (c) 2025 Alceris, Kase, Leon Kasovan\nCopyright (c) 2026 Kokorz\nCopyright (c) 2016-2026 Ikemen GO contributors\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n\nThe MIT License applies to the Ikemen GO engine and the scripts in this repo.\n\n----------------------------------------------------------------------------\n\n以下に定める条件に従い、本ソフトウェアおよび関連文書のファイル（以下「ソフトウェア」）\nの複製を取得するすべての人に対し、ソフトウェアを無制限に扱うことを無償で許可します。\nこれには、ソフトウェアの複製を使用、複写、変更、結合、掲載、頒布、サブライセンス、および\nまたは販売する権利、およびソフトウェアを提供する相手に同じことを許可する権利も無制限に含まれます。\n\n上記の著作権表示および本許諾表示を、ソフトウェアのすべての複製または重要な部分に記載するものとします。\n\nソフトウェアは「現状のまま」で、明示であるか暗黙であるかを問わず、何らの保証もなく提供されます。\nここでいう保証とは、商品性、特定の目的への適合性、および権利非侵害についての保証も含みますが、\nそれに限定されるものではありません。 作者または著作権者は、契約行為、不法行為、またはそれ以外であろうと、\nソフトウェアに起因または関連し、あるいはソフトウェアの使用またはその他の扱いによって生じる一切の請求、損害、\nその他の義務について何らの責任も負わないものとします。\n\n----------------------------------------------------------------------------\n\nWork contributed to Ikemen GO by various artists is licensed under a Creative Commons Attribution 3.0 Unported License.\nhttp://creativecommons.org/licenses/by/3.0/deed.en_US\nThe license applies to following assets:\n- The "default-3x5" font by Gacel.\n- The icon/logo of the engine by Cylia Margatroid.\n\n----------------------------------------------------------------------------\n\nOn release builds the engine is packed with more assets that could have different licences.\nIf you are using a release build check the "ScreenpackLicence.txt" file for more info.\n*/\n' + "// Ikemen GO sprite shader library\n// Custom sprite shaders #include \"sprite_lib.frag.glsl\", get the sprite coordinate with ikemenSpriteUV()\n// and the normal sprite color with ikemenSpriteColor(uv)\n// Shaders that use the GrabPass declare bgl_RenderedTexture themselves, since naming it enables the back buffer copy\n// Vulkan build command for a custom shader:\n//   glslc -fshader-stage=frag -std=450core -I <folder of this file> custom.frag -o custom.frag.spv\n\n#if __VERSION__ >= 450\n\t// VULKAN PATH\n\t#define COMPAT_TEXTURE texture\n\tlayout(binding = 1) uniform UniformBufferObject {\n\t\tvec4 x1x2x4x3;\n\t\tvec4 tint;\n\t\tvec3 add;\n\t\tvec3 mult;\n\t\tfloat alpha, gray, hue;\n\t\tint mask;\n\t\tbool isFlat, isRgba, isTrapez, neg;\n\t\tfloat iTime;\n\t\tvec2 iResolution;\n\t\tfloat aspectRatio;\n\t\tfloat sTime;\n\t};\n\tlayout(push_constant, std430) uniform u {\n\t\tvec4 spriteUV;\n\t\tvec4 palUV;\n\t\tvec4 tex1UV;\n\t\tvec4 tex2UV;\n\t\tfloat param[16];\n\t};\n\tlayout(binding = 2) uniform sampler2D tex;\n\tlayout(binding = 3) uniform sampler2D pal;\n\tlayout(binding = 5) uniform sampler2D tex1;\n\tlayout(binding = 6) uniform sampler2D tex2;\n\tlayout(location = 0) in vec2 texcoord;\n\tlayout(location = 0) out vec4 FragColor;\n#else\n\t// OPENGL / GLES PATH\n\t#define COMPAT_VARYING in\n\t#define COMPAT_TEXTURE texture\n\t#ifdef GL_ES\n\t\tprecision highp float;\n\t\tprecision highp int;\n\t#endif\n\tout vec4 FragColor;\n\n\tuniform sampler2D tex;\n\tuniform sampler2D pal;\n\tuniform vec4 x1x2x4x3;\n\tuniform vec4 tint;\n\tuniform vec3 add, mult;\n\tuniform float alpha, gray, hue;\n\tuniform int mask;\n\tuniform bool isFlat, isRgba, isTrapez, neg;\n\tuniform vec4 spriteUV;\n\tuniform vec4 palUV;\n\tuniform float iTime, sTime, aspectRatio;\n\tuniform vec2 iResolution;\n\tuniform vec4 tex1UV, tex2UV;\n\tuniform float param[16];\n\tuniform sampler2D tex1, tex2;\n\tCOMPAT_VARYING vec2 texcoord;\n#endif\n\nvec3 ikemenRgbToHsv(vec3 c)\n{\n    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);\n    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));\n    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));\n\n    float d = q.x - min(q.w, q.y);\n    float e = 1.0e-10;\n    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);\n}\n\nvec3 ikemenHsvToRgb(vec3 c)\n{\n    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);\n    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);\n    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);\n}\n\nvec3 ikemenHueShift(vec3 color, float dhue) {\n\tvec3 colorhsv = ikemenRgbToHsv(color);\n\tcolorhsv.x = mod(colorhsv.x+dhue, 1.0);\n\treturn ikemenHsvToRgb(colorhsv);\n}\n\n// Sprite-local coordinate, 0-1 across the sprite even when it's packed in an atlas\nvec2 ikemenSpriteUV() {\n\treturn (texcoord - spriteUV.xy) / (spriteUV.zw - spriteUV.xy);\n}\n\n// The engine's sprite color at a sprite-local coordinate\nvec4 ikemenSpriteColor(vec2 uv) {\n\tvec4 c;\n\tvec3 neg_base = vec3(1.0);\n\tvec3 final_add = add;\n\tvec4 final_mul = vec4(mult, alpha);\n\n\t// Select flat color or textures\n\tif (isFlat) {\n\t\tc = tint; \n\n\t\t// Treat flat colors like RGBA for math consistency\n\t\tneg_base *= c.a;\n\t\tfinal_add *= c.a;\n\t\tfinal_mul.rgb *= alpha;\n\t} else {\n\t\tif (isTrapez) {\n\t\t\tvec2 bounds = mix(x1x2x4x3.zw, x1x2x4x3.xy, clamp(uv.y, 0.0, 1.0));\n\t\t\tfloat gap = bounds[1] - bounds[0];\n\t\t\t#ifdef GL_ES\n\t\t\t\tif (abs(gap) < 0.0001) gap = 0.0001;\n\t\t\t#endif\n\t\t\tuv.x = clamp((gl_FragCoord.x - bounds[0]) / gap, 0.0, 1.0);\n\t\t}\n\n\t\t// Map into the sprite's atlas area, clamped so sampling can't reach neighboring sprites\n\t\tvec2 atlasUV = mix(spriteUV.xy, spriteUV.zw, uv);\n\t\tatlasUV = clamp(atlasUV, spriteUV.xy, spriteUV.zw - 0.0001);\n\t\tc = COMPAT_TEXTURE(tex, atlasUV);\n\n\t\t// Select with or without palette\n\t\tif (isRgba) {\n\t\t\tif (mask == -1) c.a = 1.0;\n\t\t\tneg_base *= c.a;\n\t\t\tfinal_add *= c.a;\n\t\t\tfinal_mul.rgb *= alpha;\n\t\t} else {\n\t\t\t// Palette lookup\n\t\t\tc = COMPAT_TEXTURE(pal, vec2(palUV[0]+palUV[2]*c.r*0.9966, palUV[1]));\n\t\t\tif (mask == -1) c.a = 1.0;\n\t\t}\n\t}\n\n\t// Apply PalFX\n\t// Hue\n\tif (hue != 0.0) {\n\t\tc.rgb = ikemenHueShift(c.rgb, hue);\n\t}\n\t// Invertall\n\tif (neg) {\n\t\tc.rgb = neg_base - c.rgb;\n\t}\n\t// Color\n\tc.rgb = mix(vec3((c.r + c.g + c.b) / 3.0), c.rgb, 1.0 - gray);\n\t// Add\n\tc.rgb += final_add;\n\t// Mul\n\tc *= final_mul;\n\n\t// Apply tint\n\t// Sprites only, because flat colors are already tinted\n\tif (!isFlat) {\n\t\tc.rgb = mix(c.rgb, tint.rgb * c.a, tint.a);\n\t}\n\n\treturn c;\n}\n\n// Texel of tex1/tex2, the sprites set by the tex1/tex2.anim or .spr custom shader parameters, at a 0-1 coordinate\n// Clamped in case they're packed in an atlas. Paletted sprites give palette indices, as no palette is passed\nvec4 ikemenSampleTex1(vec2 uv) {\n\tvec2 atlasUV = clamp(mix(tex1UV.xy, tex1UV.zw, uv), tex1UV.xy, tex1UV.zw - 0.0001);\n\treturn COMPAT_TEXTURE(tex1, atlasUV);\n}\n\nvec4 ikemenSampleTex2(vec2 uv) {\n\tvec2 atlasUV = clamp(mix(tex2UV.xy, tex2UV.zw, uv), tex2UV.xy, tex2UV.zw - 0.0001);\n\treturn COMPAT_TEXTURE(tex2, atlasUV);\n}\n";
