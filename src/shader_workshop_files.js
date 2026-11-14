'use strict';

const fs = require('fs/promises');
const path = require('path');
const { shaderText } = require('./shader_workshop_model');
const { fullscreenFiles, spriteFiles } = require('./shader_effect_catalog');

async function readSource(filename) {
  if ((await fs.stat(filename)).size > 1024 * 1024) throw new Error('Each shader stage must fit within 1 MiB.');
  return shaderText(new TextDecoder('utf-8', {fatal:true}).decode(await fs.readFile(filename)));
}

async function importStages(filenames) {
  if (!filenames.length || filenames.length > 2) throw new Error('Choose a fragment, or one matching vertex and fragment pair.');
  const code = {vertex:'', fragment:''};
  for (const filename of filenames) {
    const ext = path.extname(filename).toLowerCase();
    const stage = /\.vert\.glsl$/i.test(filename) ? 'vertex' : ({'.vert':'vertex','.vs':'vertex','.frag':'fragment','.fs':'fragment','.glsl':'fragment'})[ext];
    if (!stage || code[stage]) throw new Error('Choose one file per stage. Use .vert or .vs for vertex source.');
    code[stage] = await readSource(filename);
    if (!code[stage].trim()) throw new Error('The selected shader file is empty.');
  }
  if (filenames.length === 1 && /\.(?:(vert|frag)(?:\.glsl)?|vs|fs)$/i.test(filenames[0])) {
    const other = code.vertex ? 'fragment' : 'vertex';
    const sibling = filenames[0].replace(/\.(vert|frag|vs|fs)(\.glsl)?$/i,(_,ext,suffix='')=>'.'+({vs:'fs',fs:'vs',vert:'frag',frag:'vert'})[ext.toLowerCase()]+suffix);

    try { code[other] = await readSource(sibling); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return code;
}

function exportStages(project, nightly = false) {
  const fullscreen = project.target.kind === 'fullscreen';
  if (project.mode === 'graph') return require('./shader_graph').graphStages(project,nightly);
  if (project.mode !== 'code') return fullscreen ? fullscreenFiles(project) : spriteFiles(project,nightly);
  const {vertex,fragment} = project.code;
  if (!fragment.trim() || (fullscreen && !vertex.trim())) throw new Error('Fullscreen needs vertex and fragment source. Sprite targets need fragment source.');
  if (!fullscreen && !['sprite','animation','projectile','explod'].includes(project.target.kind)) throw new Error('Select a supported target.');
  if (!fullscreen && vertex.trim()) throw new Error('This pair needs the Fullscreen target. IKEMEN supplies the vertex stage for sprite shaders.');
  return fullscreen ? {vertex,fragment} : {fragment};
}

let compilerInstance;
function getCompiler() {
  if (!compilerInstance) compilerInstance = require('../bin/shader-compiler/glslang')();
  return compilerInstance;
}

function stagePayload(files, vulkan) {
  const output = {};
  for (const [stage, source] of Object.entries(files)) {
    const name = stage === 'vertex' ? 'effect.vert' : 'effect.frag';
    output[name] = source;
    if (vulkan) {
      const input = /^\s*#version\b/m.test(source) ? source : '#version 450\n' + source;
      const compiler = getCompiler();
      const words = compiler.compileGLSL(input.replace(/^\s*#include\s+"sprite_lib\.frag\.glsl"\s*$/gm,()=>require('./shader_sprite_library')),stage,false,'1.0');
      output[name + '.spv'] = Buffer.from(new Uint8Array(words.buffer,words.byteOffset,words.byteLength));
    }
  }
  return output;
}

async function preparePayload(files, vulkan) {
  if (!vulkan) return stagePayload(files,false);
  const { Worker } = require('worker_threads');
  const compiler = new Worker(path.join(__dirname,'shader_spirv_worker.js'), {workerData:files});
  let timer;
  try {
    return await new Promise((resolve,reject) => {
      timer=setTimeout(()=>reject(new Error('Vulkan shader compilation exceeded 15 seconds.')),15000);
      compiler.once('message', result => result.error ? reject(new Error(result.error)) : resolve(result.payload));
      compiler.once('error',reject);
      compiler.once('exit', code => reject(new Error('Vulkan compiler exited before returning shader stages ('+code+').')));
    });
  } finally {
    clearTimeout(timer);
    await compiler.terminate();
  }
}

async function validateDesktopGL(stages, nightly) {
  if (process.platform !== 'win32') throw new Error('The desktop GLSL validator requires Windows.');
  const root = await fs.mkdtemp(path.join(require('os').tmpdir(), 'ikemaker-glsl-'));
  try {
    const inputs = [];
    for (const [stage, source] of Object.entries(stages)) {
      const filename = 'effect.' + (stage === 'vertex' ? 'vert' : 'frag');
      if (/^\s*#\s*version\b/m.test(source)) throw new Error('Remove the #version directive before export. IKEMEN supplies it.');
      const expanded = nightly ? source.replace(/^\s*#include\s+"sprite_lib\.frag\.glsl"\s*$/gm, () => require('./shader_sprite_library')) : source;
      if (/^\s*#\s*include\b/m.test(expanded)) throw new Error('Inline external GLSL includes before exporting.');
      await fs.writeFile(path.join(root, filename), '#version 330 core\n' + expanded);
      inputs.push(filename);
    }
    const run = require('util').promisify(require('child_process').execFile);
    const compiler = path.join(__dirname,'..','bin','shader-compiler','glslangValidator.exe');
    try { await run(compiler,['-l',...inputs],{cwd:root,timeout:15000,windowsHide:true,maxBuffer:65536}); }
    catch (error) { throw new Error('OpenGL validation failed. '+String(error.stdout || error.message).slice(0,1200)); }
  } finally { await fs.rm(root,{recursive:true,force:true}); }
}

async function writeBundle(parent, label, payload) {
  const base = 'ikemaker-' + label.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').slice(0,64);
  const temp = await fs.mkdtemp(path.join(parent,'.ikemaker-export-'));
  try {
    for (const [name, bytes] of Object.entries(payload)) await fs.writeFile(path.join(temp,name),bytes);
    for (let n=1; ;n++) {
      const folder = path.join(parent,n===1 ? base : base+'-'+n);
      try { await fs.rename(temp,folder); return folder; }
      catch (error) {
        if (!['EEXIST','ENOTEMPTY','EPERM','EACCES'].includes(error.code) || !await fs.stat(folder).catch(()=>null)) throw error;
      }
    }
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
}

function fingerprint(payload) {
  const hash = require('crypto').createHash('sha256');
  for (const name of Object.keys(payload).sort()) {
    hash.update(name).update('\0').update(require('crypto').createHash('sha256').update(payload[name]).digest());
  }
  return hash.digest('hex');
}

// Replace the complete export so the engine cannot pick up stale binary stages.
async function updateBundle(folder, previousHash, payload) {
  const parent = path.dirname(folder);
  const stage = await fs.mkdtemp(path.join(parent,'.ikemaker-update-'));
  const previous = path.join(stage, 'previous');
  const replacement = path.join(stage, 'replacement');
  let moved = false;
  try {
    await fs.mkdir(replacement);
    for (const [name,bytes] of Object.entries(payload)) await fs.writeFile(path.join(replacement,name),bytes);
    await fs.rename(folder,previous);
    moved = true;
    const original = {};
    for (const entry of await fs.readdir(previous,{withFileTypes:true})) {
      if (!entry.isFile() || !/^effect\.(vert|frag)(\.spv)?$/.test(entry.name)) throw new Error('This export contains other files. Choose a new export folder.');
      original[entry.name] = await fs.readFile(path.join(previous,entry.name));
    }
    if (fingerprint(original)!==previousHash) throw new Error('The existing shader changed. Export to a new folder to keep those edits.');
    await fs.rename(replacement,folder);
    moved=false;
    return folder;
  } finally {
    if (moved) await fs.rename(previous,folder).catch(error => {throw new Error('Could not restore the previous export. It is at '+previous+'. '+error.message);});
    await fs.rm(stage,{recursive:true,force:true});
  }
}

function placement(folder, kind, name, nightly=false) {
  const absolute = path.join(folder,'effect').split(path.sep).join('/');
  if (kind === 'fullscreen') return '; save/config.ini — add this path to [Video] ExternalShaders. Remove it to undo.\n' + absolute;
  const id = 'ikm_' + name.replace(/[^a-z0-9_]/gi,'_');
  const controller = ['explod','projectile'].includes(kind);
  const key = nightly ? (controller ? 'shader.name' : 'name') : 'shader';
  const field = key + ' = "' + id + '"';
  const use = ['explod','projectile'].includes(kind) ? '; Add to the owning '+kind+' controller:\n'+field :
    '[State -2, Apply shader]\ntype = ShaderSet\ntrigger1 = 1\n' + field + '\ntime = 1\n\n# ZSS alternative, inside the chosen StateDef:\nshaderSet{'+key+': "'+id+'"; time: 1}';
  return '; Character DEF [Shaders] section, path relative to the DEF when distributed:\n'+id+' = '+absolute+'.frag\n\n'+use;
}

module.exports = {importStages, exportStages, stagePayload, preparePayload, validateDesktopGL, writeBundle, updateBundle, fingerprint, placement};
