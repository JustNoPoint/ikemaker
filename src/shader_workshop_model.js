'use strict';

const crypto = require('crypto');

const SCHEMA = 'ikemaker.shader-workshop/v1';
const MODES = Object.freeze(['preset', 'graph', 'code', 'ai']);
const TARGET_KINDS = Object.freeze([
  'sprite', 'animation', 'stage-background', 'screenpack', 'fullscreen',
  'shadow', 'reflection', 'afterimage', 'explod', 'projectile'
]);

const SAFEGUARD_DEFINITIONS = Object.freeze([
  Object.freeze({ id:'preservePaletteColors', label:'Preserve palette colors', defaultValue:true, description:'Keep the sampled RGB of visible source pixels unchanged.' }),
  Object.freeze({ id:'preserveTransparentPixels', label:'Preserve transparent pixels', defaultValue:true, description:'Do not add color or opacity where the source pixel is fully transparent.' }),
  Object.freeze({ id:'preservePartialAlpha', label:'Preserve partial alpha', defaultValue:true, description:'Keep nonzero source alpha values unchanged.' }),
  Object.freeze({ id:'preserveSpriteSilhouette', label:'Preserve sprite silhouette', defaultValue:true, description:'Do not move, expand, shrink, or cut the visible sprite boundary.' }),
  Object.freeze({ id:'preventColorBleeding', label:'Prevent color bleeding', defaultValue:true, description:'Do not sample visible color into transparent neighboring pixels.' }),
  Object.freeze({ id:'preserveIndexedPaletteBehavior', label:'Preserve indexed-palette behavior', defaultValue:true, description:'Avoid effects that depend on replacing indexed source colors.' }),
  Object.freeze({ id:'clampOutputColor', label:'Clamp output color and alpha', defaultValue:true, description:'Keep generated output channels inside the supported normalized range.' }),
  Object.freeze({ id:'applyOnlySelectedTarget', label:'Apply only to selected target', defaultValue:true, description:'Do not broaden an effect to other render surfaces.' }),
  Object.freeze({ id:'keepReversibleBaseline', label:'Keep reversible baseline', defaultValue:true, description:'Retain the unmodified project state for comparison and reset.' })
]);

const SAFEGUARD_IDS = Object.freeze(SAFEGUARD_DEFINITIONS.map(item => item.id));
const defaultSafeguards = () => Object.freeze(Object.fromEntries(SAFEGUARD_DEFINITIONS.map(item => [item.id, item.defaultValue])));

const NODE_TYPES = Object.freeze([
  Object.freeze({ id:'source-color', label:'Source Color', family:'input', conflicts:Object.freeze([]) }),
  Object.freeze({ id:'source-uv', label:'Source UV', family:'input', conflicts:Object.freeze([]) }),
  Object.freeze({ id:'time', label:'Time', family:'input', conflicts:Object.freeze([]) }),
  Object.freeze({ id:'number', label:'Number', family:'parameter', conflicts:Object.freeze([]) }),
  Object.freeze({ id:'color', label:'Color', family:'parameter', conflicts:Object.freeze([]) }),
  Object.freeze({ id:'add', label:'Add', family:'math', conflicts:Object.freeze([]) }),
  Object.freeze({ id:'multiply', label:'Multiply', family:'math', conflicts:Object.freeze([]) }),
  Object.freeze({ id:'mix', label:'Mix', family:'color', conflicts:Object.freeze(['preservePaletteColors','preserveIndexedPaletteBehavior']) }),
  Object.freeze({ id:'grayscale', label:'Grayscale', family:'color', conflicts:Object.freeze(['preservePaletteColors','preserveIndexedPaletteBehavior']) }),
  Object.freeze({ id:'uv-offset', label:'UV Offset', family:'distortion', conflicts:Object.freeze(['preserveSpriteSilhouette']) }),
  Object.freeze({ id:'alpha-threshold', label:'Alpha Threshold', family:'mask', conflicts:Object.freeze(['preservePartialAlpha','preserveSpriteSilhouette']) }),
  Object.freeze({ id:'neighbor-sample', label:'Neighbor Sample', family:'sampling', conflicts:Object.freeze(['preventColorBleeding']) }),
  Object.freeze({ id:'output-color', label:'Output Color', family:'output', conflicts:Object.freeze([]) })
]);
const NODE_TYPE_BY_ID = new Map(NODE_TYPES.map(item=>[item.id,item]));

const PRESETS = Object.freeze([
  Object.freeze({ id:'passthrough', label:'Unmodified', family:'utility', description:'Displays the selected input without changing its pixels.', conflicts:Object.freeze([]) }),
  Object.freeze({ id:'outline', label:'Outline', family:'edge', description:'Adds a colored boundary around visible pixels.', conflicts:Object.freeze(['preserveTransparentPixels','preserveSpriteSilhouette','preventColorBleeding']) }),
  Object.freeze({ id:'outer-glow', label:'Outer Glow', family:'edge', description:'Adds a soft colored glow outside the visible source.', conflicts:Object.freeze(['preserveTransparentPixels','preserveSpriteSilhouette','preventColorBleeding']) }),
  Object.freeze({ id:'palette-tint', label:'Palette Tint', family:'color', description:'Mixes a chosen color into visible source pixels.', conflicts:Object.freeze(['preservePaletteColors','preserveIndexedPaletteBehavior']) }),
  Object.freeze({ id:'grayscale', label:'Grayscale', family:'color', description:'Converts visible source colors to luminance.', conflicts:Object.freeze(['preservePaletteColors','preserveIndexedPaletteBehavior']) }),
  Object.freeze({ id:'hit-flash', label:'Hit Flash', family:'color', description:'Temporarily blends visible source colors toward a selected flash color.', conflicts:Object.freeze(['preservePaletteColors','preserveIndexedPaletteBehavior']) }),
  Object.freeze({ id:'dissolve', label:'Dissolve', family:'mask', description:'Removes portions of the source using a threshold pattern.', conflicts:Object.freeze(['preservePartialAlpha','preserveSpriteSilhouette']) }),
  Object.freeze({ id:'uv-wave', label:'Wave Distortion', family:'distortion', description:'Offsets texture sampling with an animated wave.', conflicts:Object.freeze(['preserveSpriteSilhouette']) }),
  Object.freeze({ id:'pixelate', label:'Pixelate', family:'sampling', description:'Samples the source on a coarser pixel grid.', conflicts:Object.freeze([]) }),
  Object.freeze({ id:'crt', label:'CRT Screen', family:'screen', description:'Adds scanlines and screen-space display treatment.', targetKinds:Object.freeze(['screenpack','fullscreen']), conflicts:Object.freeze(['preservePaletteColors']) })
]);

const PRESET_BY_ID = new Map(PRESETS.map(item => [item.id, item]));

function boundedText(value, max = 256) {
  if (typeof value !== 'string') return '';
  const clean = value.trim();
  return Buffer.byteLength(clean, 'utf8') <= max ? clean : '';
}

function exactBooleanMap(value, base = defaultSafeguards()) {
  const result = { ...base };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const id of SAFEGUARD_IDS) if (typeof value[id] === 'boolean') result[id] = value[id];
  }
  return Object.freeze(result);
}

function idFromSeed(seed = '') {
  return `shader-${crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0,16)}`;
}

function normalizeGraph(value) {
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const nodes=[],ids=new Set();
  for(const item of Array.isArray(source.nodes)?source.nodes.slice(0,256):[]){
    if(!item||typeof item!=='object'||Array.isArray(item))continue;
    const id=boundedText(item.id,128),type=boundedText(item.type,64);
    if(!id||ids.has(id)||!NODE_TYPE_BY_ID.has(type))continue;
    ids.add(id);nodes.push(Object.freeze({id,type,label:boundedText(item.label,128),x:Number.isFinite(item.x)?Math.max(-100000,Math.min(100000,item.x)):0,y:Number.isFinite(item.y)?Math.max(-100000,Math.min(100000,item.y)):0}));
  }
  const edges=[],edgeIds=new Set();
  for(const item of Array.isArray(source.edges)?source.edges.slice(0,512):[]){
    if(!item||typeof item!=='object'||Array.isArray(item))continue;
    const from=boundedText(item.from,128),to=boundedText(item.to,128),output=boundedText(item.output,64),input=boundedText(item.input,64),id=`${from}:${output}>${to}:${input}`;
    if(!ids.has(from)||!ids.has(to)||from===to||edgeIds.has(id))continue;
    edgeIds.add(id);edges.push(Object.freeze({from,to,output,input}));
  }
  return Object.freeze({nodes:Object.freeze(nodes),edges:Object.freeze(edges)});
}

function graphSafeguardConflicts(project, graph = project?.graph) {
  if(!project||project.schema!==SCHEMA)return Object.freeze([{id:'invalid-project',safeguardId:'',message:'A Shader Workshop v1 project is required.'}]);
  const normalized=normalizeGraph(graph),found=new Set(),result=[];
  for(const node of normalized.nodes){
    const type=NODE_TYPE_BY_ID.get(node.type);
    for(const safeguardId of type?.conflicts||[]){
      const key=`${node.id}:${safeguardId}`;
      if(project.safeguards[safeguardId]!==true||found.has(key))continue;
      found.add(key);const definition=SAFEGUARD_DEFINITIONS.find(item=>item.id===safeguardId);
      result.push(Object.freeze({id:`graph:${key}`,nodeId:node.id,safeguardId,message:`${type.label} conflicts with ${definition?.label||safeguardId}. Disable it explicitly or remove the node.`}));
    }
  }
  return Object.freeze(result);
}

function replaceGraph(project, graph, now = Date.now()) {
  if (!project || project.schema !== SCHEMA) throw new Error('A Shader Workshop v1 project is required.');
  return Object.freeze({...project,updatedAt:now,mode:'graph',graph:normalizeGraph(graph),review:Object.freeze({status:'draft',approvedOverrides:Object.freeze([]),notices:Object.freeze([])})});
}

function createShaderProject(options = {}) {
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const targetKind = TARGET_KINDS.includes(options.targetKind) ? options.targetKind : 'sprite';
  const presetId = PRESET_BY_ID.has(options.presetId) ? options.presetId : 'passthrough';
  const mode = MODES.includes(options.mode) ? options.mode : 'preset';
  const name = boundedText(options.name, 128) || 'Untitled Shader';
  const id = boundedText(options.id, 128) || idFromSeed(`${name}\0${now}`);
  return Object.freeze({
    schema:SCHEMA, id, name, createdAt:now, updatedAt:now,
    engineIndependent:true,
    mode, presetId,
    target:Object.freeze({ kind:targetKind, label:boundedText(options.targetLabel,128), sourceRef:boundedText(options.sourceRef,512) }),
    safeguards:exactBooleanMap(options.safeguards),
    parameters:Object.freeze({}),
    graph:normalizeGraph(options.graph),
    code:Object.freeze({ vertex:'', fragment:'' }),
    baseline:Object.freeze({ presetId:'passthrough', fingerprint:'' }),
    review:Object.freeze({ status:'draft', approvedOverrides:Object.freeze([]), notices:Object.freeze([]) })
  });
}

function setSafeguard(project, id, enabled, now = Date.now()) {
  if (!project || project.schema !== SCHEMA) throw new Error('A Shader Workshop v1 project is required.');
  if (!SAFEGUARD_IDS.includes(id)) throw new Error(`Unknown shader safeguard: ${id}`);
  if (typeof enabled !== 'boolean') throw new Error('Shader safeguard values must be boolean.');
  return Object.freeze({ ...project, updatedAt:now, safeguards:Object.freeze({ ...project.safeguards, [id]:enabled }), review:Object.freeze({ status:'draft', approvedOverrides:Object.freeze([]), notices:Object.freeze([]) }) });
}

function selectPreset(project, presetId, now = Date.now()) {
  if (!project || project.schema !== SCHEMA) throw new Error('A Shader Workshop v1 project is required.');
  const preset = PRESET_BY_ID.get(presetId);
  if (!preset) throw new Error(`Unknown shader preset: ${presetId}`);
  if (preset.targetKinds && !preset.targetKinds.includes(project.target.kind)) throw new Error(`${preset.label} does not support the ${project.target.kind} target.`);
  return Object.freeze({ ...project, updatedAt:now, mode:'preset', presetId, review:Object.freeze({ status:'draft', approvedOverrides:Object.freeze([]), notices:Object.freeze([]) }) });
}

function setTargetKind(project, targetKind, now = Date.now()) {
  if (!project || project.schema !== SCHEMA) throw new Error('A Shader Workshop v1 project is required.');
  if (!TARGET_KINDS.includes(targetKind)) throw new Error(`Unknown shader target: ${targetKind}`);
  const preset=PRESET_BY_ID.get(project.presetId),presetId=preset?.targetKinds&&!preset.targetKinds.includes(targetKind)?'passthrough':project.presetId;
  return Object.freeze({...project,updatedAt:now,presetId,target:Object.freeze({...project.target,kind:targetKind}),review:Object.freeze({status:'draft',approvedOverrides:Object.freeze([]),notices:Object.freeze([])})});
}

function safeguardConflicts(project, effect = null) {
  if (!project || project.schema !== SCHEMA) return Object.freeze([{ id:'invalid-project', safeguardId:'', message:'A Shader Workshop v1 project is required.' }]);
  const preset = effect || PRESET_BY_ID.get(project.presetId);
  if (!preset) return Object.freeze([{ id:'unknown-effect', safeguardId:'', message:'The selected effect is not in the reviewed preset catalog.' }]);
  return Object.freeze((preset.conflicts || []).filter(id => project.safeguards[id] === true).map(id => {
    const definition = SAFEGUARD_DEFINITIONS.find(item => item.id === id);
    return Object.freeze({ id:`safeguard:${id}`, safeguardId:id, message:`${preset.label} conflicts with ${definition?.label || id}. Disable it explicitly or choose a compatible effect.` });
  }));
}

function buildAiShaderBrief(project, description, options = {}) {
  if (!project || project.schema !== SCHEMA) throw new Error('A Shader Workshop v1 project is required.');
  const intent = boundedText(description, 4096);
  if (!intent) throw new Error('Describe the requested shader effect.');
  const assetSummary = options.assetSummary && typeof options.assetSummary === 'object'
    ? Object.freeze({ width:Number.isInteger(options.assetSummary.width)?options.assetSummary.width:0, height:Number.isInteger(options.assetSummary.height)?options.assetSummary.height:0, animated:options.assetSummary.animated===true, indexed:options.assetSummary.indexed===true })
    : Object.freeze({ width:0, height:0, animated:false, indexed:false });
  return Object.freeze({
    schema:'ikemaker.shader-ai-brief/v1',
    projectId:project.id,
    intent,
    targetKind:project.target.kind,
    safeguards:Object.freeze({ ...project.safeguards }),
    constraints:Object.freeze([
      'Safeguards are host-owned constraints and cannot be disabled by generated output.',
      'Return effect metadata, parameters, graph, and source as a proposal only.',
      'Do not claim compilation, visual correctness, performance, or IKEMEN runtime compatibility.',
      'Do not request project files, filesystem paths, source pixels, or palette contents unless the user separately authorizes them.'
    ]),
    assetSummary,
    includesSourcePixels:false,
    includesProjectFiles:false,
    variations:Math.max(1,Math.min(3,Number.isInteger(options.variations)?options.variations:3))
  });
}

function reviewGeneratedCandidate(project, candidate, approvedOverrides = []) {
  if (!project || project.schema !== SCHEMA) throw new Error('A Shader Workshop v1 project is required.');
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) throw new Error('A generated shader candidate is required.');
  const conflicts = safeguardConflicts(project, candidate);
  const approved = new Set(Array.isArray(approvedOverrides) ? approvedOverrides.filter(id => SAFEGUARD_IDS.includes(id)) : []);
  const unresolved = conflicts.filter(item => !approved.has(item.safeguardId));
  return Object.freeze({
    accepted:unresolved.length===0,
    requiresExplicitOverride:conflicts.length>0,
    conflicts,
    unresolved:Object.freeze(unresolved),
    approvedOverrides:Object.freeze([...approved]),
    proposedSafeguardChanges:Object.freeze([]),
    candidate:Object.freeze({
      id:boundedText(candidate.id,128) || idFromSeed(JSON.stringify(candidate)),
      label:boundedText(candidate.label,128) || 'Generated proposal',
      description:boundedText(candidate.description,1024),
      conflicts:Object.freeze(Array.isArray(candidate.conflicts)?candidate.conflicts.filter(id=>SAFEGUARD_IDS.includes(id)):[])
    })
  });
}

function serializeShaderProject(project) {
  if (!project || project.schema !== SCHEMA) throw new Error('A Shader Workshop v1 project is required.');
  return `${JSON.stringify(project, null, 2)}\n`;
}

function parseShaderProject(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 4 * 1024 * 1024) throw new Error('Shader project text is missing or oversized.');
  const source = JSON.parse(text);
  if (!source || source.schema !== SCHEMA) throw new Error('Unsupported Shader Workshop project schema.');
  const project = createShaderProject(source);
  return Object.freeze({ ...project,
    id:boundedText(source.id,128) || project.id,
    createdAt:Number.isFinite(source.createdAt)?source.createdAt:project.createdAt,
    updatedAt:Number.isFinite(source.updatedAt)?source.updatedAt:project.updatedAt,
    safeguards:exactBooleanMap(source.safeguards),
    parameters:Object.freeze(source.parameters && typeof source.parameters==='object'&&!Array.isArray(source.parameters)?{...source.parameters}:{}),
    graph:normalizeGraph(source.graph),
    code:Object.freeze({ vertex:boundedText(source.code?.vertex,1024*1024), fragment:boundedText(source.code?.fragment,1024*1024) })
  });
}

module.exports = {
  SCHEMA, MODES, TARGET_KINDS, SAFEGUARD_DEFINITIONS, SAFEGUARD_IDS, PRESETS, NODE_TYPES,
  defaultSafeguards, createShaderProject, setSafeguard, selectPreset, setTargetKind,
  safeguardConflicts, normalizeGraph, graphSafeguardConflicts, replaceGraph, buildAiShaderBrief, reviewGeneratedCandidate,
  serializeShaderProject, parseShaderProject
};
