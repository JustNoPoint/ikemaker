'use strict';

const { requirePreviewAllowed } = require('./shader_safeguard_policy');

const SPRITE_TARGETS = Object.freeze(['sprite','animation','explod','projectile']);
const EFFECTS = Object.freeze([
  effect('passthrough','Unmodified',{},{}),
  effect('palette-tint','Palette Tint',{tint:color([0.2,0.55,1,1]),amount:number(0.35,0,1)},{changesRgb:true,breaksIndexedBehavior:true}),
  effect('crt','CRT Screen',{strength:number(0.25,0,1)},{changesRgb:true,breaksIndexedBehavior:true}),
  effect('grayscale','Grayscale',{amount:number(1,0,1)},{changesRgb:true,breaksIndexedBehavior:true}),
  effect('hit-flash','Hit Flash',{color:color([1,1,1,1]),amount:number(0.8,0,1)},{changesRgb:true,breaksIndexedBehavior:true}),
  // Pixelation preserves the palette's set of colors, but deliberately changes
  // which RGB value occupies an output pixel. It cannot claim the stronger
  // per-pixel palette-color safeguard.
  effect('pixelate','Pixelate',{pixelSize:number(4,1,64)},{changesRgb:true}),
  // Outline and Outer Glow only write fully transparent pixels next to visible
  // ones, so visible RGB and partial alpha stay exact. They cannot draw past the
  // sprite's image rectangle, because IKEMEN only rasterizes that quad.
  effect('outline','Outline',{color:color([1,1,1,1]),width:integer(1,1,4)},{addsVisiblePixels:true,changesSilhouette:true,neighborSampling:true},SPRITE_TARGETS),
  effect('outer-glow','Outer Glow',{color:color([0.3,0.7,1,1]),radius:integer(4,1,12),strength:number(0.8,0,1)},{addsVisiblePixels:true,changesSilhouette:true,neighborSampling:true},SPRITE_TARGETS),
  // Dissolve hides whole cells. Remaining pixels keep their exact RGB and alpha;
  // hidden pixels, including partially transparent ones, become fully transparent.
  effect('dissolve','Dissolve',{amount:number(0.5,0,1),cellSize:integer(2,1,16)},{changesAlpha:true,changesSilhouette:true},SPRITE_TARGETS),
  // Wave moves pixels sideways, so output pixels take other source pixels' RGB
  // and alpha, and visible color can move into transparent neighbors.
  effect('uv-wave','Wave Distortion',{amplitude:number(2,0,32),wavelength:number(24,2,256),phase:number(0,0,1),speed:number(0,-8,8)},{changesRgb:true,addsVisiblePixels:true,changesAlpha:true,changesSilhouette:true,neighborSampling:true},[...SPRITE_TARGETS,'fullscreen'])
]);
const BY_ID = new Map(EFFECTS.map(item=>[item.id,item]));
const OWN_ALPHA = new Set(['outline','outer-glow','dissolve','uv-wave']);
function number(defaultValue,min,max){return Object.freeze({kind:'number',defaultValue,min,max});}
function integer(defaultValue,min,max){return Object.freeze({kind:'number',integer:true,defaultValue,min,max});}
function color(defaultValue){return Object.freeze({kind:'color',defaultValue:Object.freeze(defaultValue)});}
function effect(id,label,parameters,capabilities,targets=null){return Object.freeze({id,label,trusted:true,targets:targets&&Object.freeze([...targets]),parameters:Object.freeze(parameters),capabilities:Object.freeze({changesRgb:false,addsVisiblePixels:false,changesAlpha:false,changesSilhouette:false,neighborSampling:false,breaksIndexedBehavior:false,...capabilities})});}
function finite(value,fallback,min,max){const number=Number(value);return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback;}
function normalizeParameters(effect,values={}){
  values=values || {};
  const result={};
  for(const [id,schema] of Object.entries(effect.parameters)){
    if(schema.kind==='number'){const value=finite(values[id],schema.defaultValue,schema.min,schema.max);result[id]=schema.integer?Math.round(value):value;}
    else result[id]=Object.freeze(schema.defaultValue.map((fallback,index)=>finite(Array.isArray(values[id])?values[id][index]:undefined,fallback,0,1)));
  }
  return Object.freeze(result);
}
function float(value){const text=Number(value).toFixed(6).replace(/0+$/,'').replace(/\.$/,'');return text.includes('.')?text:`${text}.0`;}
function vec4(value){return `vec4(${value.map(float).join(', ')})`;}
function body(effect,parameters){
  if(effect.id==='palette-tint')return `color.rgb = mix(color.rgb, ${vec4(parameters.tint)}.rgb, ${float(parameters.amount)});`;
  if(effect.id==='crt')return `color.rgb *= 1.0 - ${float(parameters.strength)} * mod(floor(vUv.y * uTextureSize.y), 2.0);`;
  if(effect.id==='grayscale')return `float luminance = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));\n  color.rgb = mix(color.rgb, vec3(luminance), ${float(parameters.amount)});`;
  if(effect.id==='hit-flash')return `color.rgb = mix(color.rgb, ${vec4(parameters.color)}.rgb, ${float(parameters.amount)});`;
  if(effect.id==='pixelate')return `vec2 safeSize = max(uTextureSize, vec2(1.0));\n  vec2 cell = vec2(${float(parameters.pixelSize)}) / safeSize;\n  sampleUv = (floor(vUv / cell) + vec2(0.5)) * cell;\n  color = texture(uTexture, clamp(sampleUv, vec2(0.0), vec2(1.0)));`;
  return '';
}
// Shared GLSL for the effects that decide their own alpha. One generator feeds
// the preview, both preview fallbacks and every runtime export, so the
// thresholds, cell pattern and falloff stay identical.
//   env.sample(p)  expression for the color at sprite-local p (null: the export samples itself)
//   env.alpha      helper body returning the visible alpha at sprite-local p
//   env.size       expression for the sprite size in texels
//   env.uv         sprite-local coordinate of the pixel being shaded
//   env.v          name of the color variable
//   env.premultiplied  IKEMEN sprite output is premultiplied; the preview is straight
//   env.edge       'transparent' (sprites) or 'clamp' (fullscreen) outside the image
//   env.time       seconds uniform: graphTime (preview), CurrentTime (fullscreen), iTime (characters)
function ownAlphaParts(effect,parameters,env){
  const helpers=[
    'bool ikmInside(vec2 p) { return p.x >= 0.0 && p.y >= 0.0 && p.x <= 1.0 && p.y <= 1.0; }',
    `vec2 ikmSize() { return max(${env.size}, vec2(1.0)); }`,
    `float ikmAlpha(vec2 p) {\n  if (!ikmInside(p)) return 0.0;\n  ${env.alpha}\n}`
  ];
  const v=env.v,uv=env.uv,paint=(rgba,strength)=>{
    const k=`(${float(rgba[3])} * ${strength})`;
    return env.premultiplied?`vec4(vec3(${rgba.slice(0,3).map(float).join(', ')}) * ${k}, ${k})`:`vec4(${rgba.slice(0,3).map(float).join(', ')}, ${k})`;
  };
  if(effect.id==='outline'){
    const w=parameters.width;
    return {helpers,sample:'',effect:`if (${v}.a <= 0.0) {
    vec2 ikmTexel = 1.0 / ikmSize();
    float ikmHit = 0.0;
    for (int y = -${w}; y <= ${w}; y++) {
      for (int x = -${w}; x <= ${w}; x++) {
        ikmHit = max(ikmHit, ikmAlpha(${uv} + vec2(float(x), float(y)) * ikmTexel));
      }
    }
    if (ikmHit > 0.0) ${v} = ${paint(parameters.color,'ikmHit')};
  }`};
  }
  if(effect.id==='outer-glow'){
    const r=parameters.radius;
    return {helpers,sample:'',effect:`if (${v}.a <= 0.0) {
    vec2 ikmTexel = 1.0 / ikmSize();
    float ikmGlow = 0.0;
    for (int r = 1; r <= ${r}; r++) {
      for (int i = 0; i < 16; i++) {
        float ikmAngle = float(i) * 0.39269908;
        vec2 ikmOffset = vec2(cos(ikmAngle), sin(ikmAngle)) * float(r) * ikmTexel;
        ikmGlow = max(ikmGlow, ikmAlpha(${uv} + ikmOffset) * (1.0 - float(r - 1) / ${float(r)}));
      }
    }
    if (ikmGlow > 0.0) ${v} = ${paint(parameters.color,`${float(parameters.strength)} * ikmGlow`)};
  }`};
  }
  if(effect.id==='dissolve'){
    // Interleaved gradient noise on whole cells: no sin(), so GPUs agree.
    return {helpers,sample:'',effect:`{
    vec2 ikmCell = floor(${uv} * ikmSize() / ${float(parameters.cellSize)});
    float ikmNoise = fract(52.9829189 * fract(dot(ikmCell, vec2(0.06711056, 0.00583715))));
    if (ikmNoise < ${float(parameters.amount)}) ${env.premultiplied?`${v} = vec4(0.0)`:`${v}.a = 0.0`};
  }`};
  }
  if(effect.id==='uv-wave'){
    helpers.push(`vec2 ikmWave(vec2 p) {\n  vec2 s = ikmSize();\n  return p + vec2(${float(parameters.amplitude)} * sin(6.2831853 * (p.y * s.y / ${float(parameters.wavelength)} + ${float(parameters.phase)}${waveAnimated(parameters)?` + ${float(parameters.speed)} * ${env.time}`:''})) / s.x, 0.0);\n}`);
    const sample=env.sample?(env.edge==='clamp'
      ?`sampleUv = clamp(ikmWave(${uv}), vec2(0.0), vec2(1.0));\n  ${v} = ${env.sample('sampleUv')};`
      :`sampleUv = ikmWave(${uv});\n  ${v} = ikmInside(sampleUv) ? ${env.sample('sampleUv')} : vec4(0.0);`):'';
    return {helpers,sample,effect:''};
  }
  throw new Error('Unknown own-alpha shader effect.');
}
// Speed is in wave cycles per second; 0 keeps a still wave at the chosen phase.
function waveAnimated(parameters){return Number.isFinite(parameters?.speed)&&parameters.speed!==0;}
function previewFragment(effect,parameters,es3){
  const tex=es3?'texture':'texture2D',parts=ownAlphaParts(effect,parameters,{sample:p=>`${tex}(uTexture, ${p})`,alpha:`return ${tex}(uTexture, p).a;`,size:'uTextureSize',uv:'vUv',v:'color',premultiplied:false,edge:'transparent',time:'graphTime'});
  const head=es3?'#version 300 es\nprecision highp float;\nuniform sampler2D uTexture;\nuniform vec2 uTextureSize;\nin vec2 vUv;\nout vec4 outColor;\n':'precision highp float;\nuniform sampler2D uTexture;\nuniform vec2 uTextureSize;\nvarying vec2 vUv;\n',clock=effect.id==='uv-wave'&&waveAnimated(parameters)?'uniform float graphTime;\n':'';
  return `${head}${clock}${parts.helpers.join('\n')}\nvoid main(){\n  vec2 sampleUv = vUv;\n  vec4 sourceColor = ${tex}(uTexture, clamp(vUv, vec2(0.0), vec2(1.0)));\n  vec4 color = sourceColor;${parts.sample?`\n  ${parts.sample}`:''}${parts.effect?`\n  ${parts.effect}`:''}\n  ${es3?'outColor':'gl_FragColor'} = clamp(color, 0.0, 1.0);\n}`;
}
function requireTarget(effect,kind){
  if(effect.targets&&!effect.targets.includes(kind))throw new Error(effect.targets.includes('fullscreen')?`${effect.label} does not support the ${kind} target.`:`${effect.label} works on individual sprites. Choose a sprite, animation, Explod or projectile target.`);
}
function compileTrustedEffect(project, effectId=project?.presetId, values=project?.parameters?.[effectId] || {}){
  if(project?.mode!=='preset')throw new Error('Only trusted preset effects can execute in the initial Shader Workshop renderer.');
  const effect=BY_ID.get(effectId);if(!effect)throw new Error('Unknown or untrusted shader effect.');
  const policy=requirePreviewAllowed(project,effect),parameters=normalizeParameters(effect,values),effectBody=body(effect,parameters);
  const vertex='#version 300 es\nprecision highp float;\nin vec2 aPosition;\nin vec2 aUv;\nout vec2 vUv;\nvoid main(){vUv=aUv;gl_Position=vec4(aPosition,0.0,1.0);}';
  if(OWN_ALPHA.has(effect.id)){
    const fallback=Object.freeze({vertex:'precision highp float;\nattribute vec2 aPosition;\nattribute vec2 aUv;\nvarying vec2 vUv;\nvoid main(){vUv=aUv;gl_Position=vec4(aPosition,0.0,1.0);}',fragment:previewFragment(effect,parameters,false)});
    return Object.freeze({schema:'ikemaker.trusted-shader/v1',effectId:effect.id,label:effect.label,parameters,policy,vertex,fragment:previewFragment(effect,parameters,true),fallback,animated:effect.id==='uv-wave'&&waveAnimated(parameters),sampler:Object.freeze({min:'nearest',mag:'nearest',wrapS:'clamp-to-edge',wrapT:'clamp-to-edge'})});
  }
  const fragment=`#version 300 es\nprecision highp float;\nuniform sampler2D uTexture;\nuniform vec2 uTextureSize;\nin vec2 vUv;\nout vec4 outColor;\nvoid main(){\n  vec2 sampleUv = vUv;\n  vec4 sourceColor = texture(uTexture, clamp(vUv, vec2(0.0), vec2(1.0)));\n  vec4 color = sourceColor;${effectBody?`\n  ${effectBody}`:''}\n  if (sourceColor.a <= 0.0) color = vec4(0.0);\n  color.a = sourceColor.a;\n  outColor = clamp(color, 0.0, 1.0);\n}`;
  const fallbackBody=effectBody.replaceAll('texture(','texture2D('),fallback=Object.freeze({vertex:'precision highp float;\nattribute vec2 aPosition;\nattribute vec2 aUv;\nvarying vec2 vUv;\nvoid main(){vUv=aUv;gl_Position=vec4(aPosition,0.0,1.0);}',fragment:`precision highp float;\nuniform sampler2D uTexture;\nuniform vec2 uTextureSize;\nvarying vec2 vUv;\nvoid main(){\n  vec2 sampleUv = vUv;\n  vec4 sourceColor = texture2D(uTexture, clamp(vUv, vec2(0.0), vec2(1.0)));\n  vec4 color = sourceColor;${fallbackBody?`\n  ${fallbackBody}`:''}\n  if (sourceColor.a <= 0.0) color = vec4(0.0);\n  color.a = sourceColor.a;\n  gl_FragColor = clamp(color, 0.0, 1.0);\n}`});
  return Object.freeze({schema:'ikemaker.trusted-shader/v1',effectId:effect.id,label:effect.label,parameters,policy,vertex,fragment,fallback,sampler:Object.freeze({min:'nearest',mag:'nearest',wrapS:'clamp-to-edge',wrapT:'clamp-to-edge'})});
}

// IKEMEN supplies its own GLSL version header and the final frame texture.
function fullscreenFiles(project) {
  if (project.target.kind !== 'fullscreen') throw new Error('Select the Fullscreen target.');
  if (project.presetId === 'hit-flash') throw new Error('Hit Flash needs character state timing. Export it for a sprite or animation.');
  if (BY_ID.has(project.presetId)) requireTarget(BY_ID.get(project.presetId), 'fullscreen');
  const shader = compileTrustedEffect(project);
  let helpers = '', effectBody, clockVk = '', clockGl = '';
  if (OWN_ALPHA.has(shader.effectId)) {
    // Windows desktop IKEMEN supplies the SDL performance counter in 10 MHz ticks.
    const parts = ownAlphaParts(BY_ID.get(shader.effectId), shader.parameters, {sample:p=>`texture(Texture, ${p})`, alpha:'return texture(Texture, p).a;', size:'TextureSize', uv:'vUv', v:'color', premultiplied:false, edge:'clamp', time:'(CurrentTime / 10000000.0)'});
    helpers = parts.helpers.join('\n') + '\n';
    // Vulkan's post-process push constant holds TextureSize, then CurrentTime at offset 8.
    if (shader.effectId === 'uv-wave' && waveAnimated(shader.parameters)) { clockVk = ' float CurrentTime;'; clockGl = '\nuniform float CurrentTime;'; }
    effectBody = [parts.sample, parts.effect].filter(Boolean).join('\n  ');
  } else effectBody = body(BY_ID.get(shader.effectId), shader.parameters)
    .replaceAll('uTextureSize', 'TextureSize').replaceAll('uTexture', 'Texture');
  return {
    vertex: '#if __VERSION__ >= 450\nlayout(location=0) in vec2 VertCoord;\nlayout(location=0) out vec2 vUv;\n#else\nin vec2 VertCoord;\nout vec2 vUv;\n#endif\nvoid main() { vUv = (VertCoord + 1.0) * 0.5; gl_Position = vec4(VertCoord, 0.0, 1.0); }\n',
    fragment: `#ifdef GL_ES
precision highp float;
#endif
#if __VERSION__ >= 450
layout(binding=0) uniform sampler2D Texture;
layout(push_constant) uniform Size {vec2 TextureSize;${clockVk}};
layout(location=0) in vec2 vUv;
layout(location=0) out vec4 FragColor;
#else
uniform sampler2D Texture;
uniform vec2 TextureSize;${clockGl}
in vec2 vUv;
out vec4 FragColor;
#endif
${helpers}void main() {
  vec2 sampleUv = vUv;
  vec4 sourceColor = texture(Texture, sampleUv);
  vec4 color = sourceColor;
  ${effectBody}
  color.a = sourceColor.a;
  FragColor = clamp(color, 0.0, 1.0);
}
`
  };
}

function spriteFiles(project, nightly = false) {
  if (!['sprite', 'animation', 'explod', 'projectile'].includes(project.target.kind)) throw new Error('Choose a sprite, animation, Explod or projectile target.');
  if (BY_ID.has(project.presetId)) requireTarget(BY_ID.get(project.presetId), project.target.kind);
  const shader = compileTrustedEffect(project);
  if (OWN_ALPHA.has(shader.effectId)) return ownAlphaSpriteFiles(BY_ID.get(shader.effectId), shader.parameters, nightly);
  const sample = shader.effectId === 'pixelate' ? `vec2 size = vec2(textureSize(tex, 0));
        float cell = ${float(shader.parameters.pixelSize)};
        uv = clamp((floor(uv * size / cell) + 0.5) * cell / size, vec2(0.0), vec2(1.0));` : '';
  const effect = shader.effectId === 'pixelate' ? '' : body(BY_ID.get(shader.effectId),shader.parameters).replaceAll('color.rgb','c.rgb');
  if (nightly) {
    const snap = shader.effectId === 'pixelate' ? `vec2 size = max(vec2(1.0),vec2(textureSize(tex,0)) * (spriteUV.zw-spriteUV.xy));
    uv = clamp((floor(uv * size / ${float(shader.parameters.pixelSize)})+0.5)*${float(shader.parameters.pixelSize)}/size,vec2(0.0),vec2(1.0));` : '';
    return {fragment:require('./shader_sprite_library')+'\nvoid main() { vec2 uv = ikemenSpriteUV();\n'+snap+'\nvec4 c = ikemenSpriteColor(uv);\n'+effect+'\nFragColor = c; }\n'};
  }
  return {fragment:require('./shader_sprite_template').replace('/* sample position */',sample).replace('/* color effect */',effect)};
}

// Runtime sprite exports. IKEMEN's sprite output is premultiplied, and flat
// (isFlat) draws are color rectangles, so the effect skips them.
function ownAlphaSpriteFiles(effect, parameters, nightly) {
  const wave = effect.id === 'uv-wave';
  if (nightly) {
    const parts = ownAlphaParts(effect, parameters, {sample:null, alpha:'return ikemenSpriteColor(p).a;', size:'vec2(textureSize(tex, 0)) * (spriteUV.zw - spriteUV.xy)', uv:'uv', v:'c', premultiplied:true, edge:'transparent', time:'iTime'});
    const color = wave ? 'uv = ikmWave(uv);\n  vec4 c = ikmInside(uv) ? ikemenSpriteColor(uv) : vec4(0.0);' : 'vec4 c = ikemenSpriteColor(uv);';
    return {fragment:require('./shader_sprite_library')+'\n'+parts.helpers.join('\n')+'\nvoid main() {\n  vec2 uv = ikemenSpriteUV();\n  '+color+(parts.effect ? '\n  if (!isFlat) {\n  '+parts.effect+'\n  }' : '')+'\n  FragColor = c;\n}\n'};
  }
  // IKEMEN 1.0 template: palette lookup mirrors the template's own sampling.
  const alpha = `vec4 s = COMPAT_TEXTURE(tex, p);
  if (mask == -1) return alpha;
  if (!isRgba) {
#if __VERSION__ >= 450
    s = COMPAT_TEXTURE(pal, vec2(palUV[0]+palUV[2]*s.r*0.9966, palUV[1]));
#else
    s = COMPAT_TEXTURE(pal, vec2(s.r*0.9966, 0.5));
#endif
  }
  return s.a * alpha;`;
  const parts = ownAlphaParts(effect, parameters, {sample:null, alpha, size:'vec2(textureSize(tex, 0))', uv:'texcoord', v:'c', premultiplied:true, edge:'transparent', time:'iTime'});
  const effectCode = wave ? 'if (!isFlat && !ikmInside(ikmWave(texcoord))) c = vec4(0.0);' : 'if (!isFlat) {\n  '+parts.effect+'\n  }';
  const template = require('./shader_sprite_template');
  if (!template.includes('void main(void) {') || !template.includes('/* sample position */') || !template.includes('/* color effect */')) throw new Error('The IKEMEN 1.0 sprite template is missing an effect insertion point.');
  return {fragment:template.replace('void main(void) {', () => parts.helpers.join('\n')+'\n\nvoid main(void) {').replace('/* sample position */', () => wave ? 'uv = ikmWave(uv);' : '').replace('/* color effect */', () => effectCode)};
}

module.exports={EFFECTS,BY_ID,OWN_ALPHA,normalizeParameters,compileTrustedEffect,fullscreenFiles,spriteFiles};
