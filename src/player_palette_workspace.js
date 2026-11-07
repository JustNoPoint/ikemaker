'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vscode = require('vscode');
const { chooseCharacterDef, isCharacterDef } = require('./character_picker');
const { routeRosterPalette, characterSff } = require('./roster_palette_flow');
const { parseDef, kind } = require('./def_model');
const { stageModel } = require('./stage_model');
const { screenpackModel } = require('./screenpack_model');
const { createBuildPackage } = require('./sff_commands');
const { captureTarget, candidatePath, SEPARATE, SHARE } = require('./sff_build_safety');
const { DEFAULT_PROFILE } = require('./sff_build_profile');
const { transactionalWriteSet } = require('./mutation_safety');
const { runPaletteWorkshopBuild, assertPaletteBuildAuthority } = require('./palette_workshop_build_coordinator');
const { configurePaletteWorkspaceService, paletteWorkspaceService } = require('./palette_workspace_service');
const { configurePaletteWorkspaceController, paletteWorkspaceController } = require('./palette_workspace_controller');
const { readPalettePlan } = require('./palette_plan');
const { readSff } = require('./sff_reader');

function sha(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function preferredStagedPalette(plan={}) { return (plan.palettes||[]).map((item,index)=>({item,index})).filter(({item})=>item.kind!=='alias'&&Number.isInteger(Number(item.group))&&Number.isInteger(Number(item.number))).sort((left,right)=>String(left.item.stagedAt||'').localeCompare(String(right.item.stagedAt||''))||left.index-right.index).at(-1)?.item||null; }
function focusAdoptedPalette(service,filename,preferred,archive=readSff(filename)){if(!preferred)return null;const palette=archive.palettes.find(item=>item.group===Number(preferred.group)&&item.number===Number(preferred.number));if(!palette)return null;service.select(filename,{palette:{physicalIndex:palette.index,group:palette.group,number:palette.number}});const current=service.snapshot(filename);service.mutate(filename,{interaction:{...current.interaction,status:`Build applied and selected palette ${palette.group},${palette.number} in ${path.resolve(filename)}.`}});return{physicalIndex:palette.index,group:palette.group,number:palette.number};}

const PALETTE_PACKAGE_MARKER = '.ikemaker-palette-package-owner.json';
const PALETTE_PACKAGE_SEEDS = Object.freeze(['palette-only-preserve.csv','palette-workshop-authority.json',PALETTE_PACKAGE_MARKER]);
function pathKey(value){const resolved=path.resolve(value);return process.platform==='win32'?resolved.toLowerCase():resolved;}
function directoryIdentity(io, directory){
  const lexical=path.resolve(directory),stat=io.lstatSync(lexical);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('Palette Workshop package directory is not a private regular directory.');
  const real=io.realpathSync.native?io.realpathSync.native(lexical):io.realpathSync(lexical);
  if(pathKey(real)!==pathKey(lexical))throw new Error('Palette Workshop package directory resolves through a link or junction.');
  return Object.freeze({path:lexical,real:path.resolve(real),dev:String(stat.dev),ino:String(stat.ino)});
}
function sameDirectoryIdentity(io, identity){try{const current=directoryIdentity(io,identity.path);return pathKey(current.real)===pathKey(identity.real)&&current.dev===identity.dev&&current.ino===identity.ino;}catch(_){return false;}}
function regularExact(io, filename, expected){try{const stat=io.lstatSync(filename);if(!stat.isFile()||stat.isSymbolicLink())return false;const observed=io.readFileSync(filename);return observed.length===expected.length&&sha(observed)===sha(expected)&&observed.equals(expected);}catch(_){return false;}}
function sealedSeed(io, seal, manifestBytes, authorityBytes, markerBytes){
  if(!sameDirectoryIdentity(io,seal))return false;
  return regularExact(io,path.join(seal.path,PALETTE_PACKAGE_SEEDS[0]),manifestBytes)&&regularExact(io,path.join(seal.path,PALETTE_PACKAGE_SEEDS[1]),authorityBytes)&&regularExact(io,path.join(seal.path,PALETTE_PACKAGE_SEEDS[2]),markerBytes);
}
function seedOnly(io, packageRoot){try{const names=io.readdirSync(packageRoot);return names.length===PALETTE_PACKAGE_SEEDS.length&&PALETTE_PACKAGE_SEEDS.every(name=>names.includes(name));}catch(_){return false;}}
function retainedPackageError(error,packageRoot,reason){const value=error instanceof Error?error:new Error(String(error));value.message=`${value.message}\nThe temporary Palette Workshop package was retained for manual cleanup because ${reason}: ${packageRoot}`;value.manualCleanupRequired=true;value.packageRoot=packageRoot;return value;}

async function preparePaletteOnlyPackage({ filename, authority }, services = {}) {
  const io=services.fs||fs,showOpenDialog=services.showOpenDialog||((options)=>vscode.window.showOpenDialog(options)),writeSet=services.transactionalWriteSet||transactionalWriteSet,buildPackage=services.createBuildPackage||createBuildPackage,assertAuthority=services.assertAuthority||assertPaletteBuildAuthority,randomBytes=services.randomBytes||crypto.randomBytes,now=services.now||(()=>Date.now());
  const picked = await showOpenDialog({ title: 'Choose a folder for the reviewed Palette Workshop build package', canSelectMany: false, canSelectFiles: false, canSelectFolders: true });
  if (!picked?.[0]) return null;
  const selectedRoot = path.resolve(picked[0].fsPath);
  assertAuthority(authority);
  const packageRoot = path.join(selectedRoot, `palette-workshop-${path.basename(filename, path.extname(filename)).replace(/[^a-z0-9._-]+/gi, '_')}-${now()}-${randomBytes(4).toString('hex')}`);
  const relation = path.relative(selectedRoot, packageRoot);
  if (!relation || path.isAbsolute(relation) || relation.split(path.sep).includes('..')) throw new Error('Palette Workshop package path escaped the selected output folder.');
  io.mkdirSync(packageRoot, { recursive: false });
  const seal=directoryIdentity(io,packageRoot);
  const manifestPath = path.join(packageRoot, PALETTE_PACKAGE_SEEDS[0]),manifestBytes=Buffer.from('OriginalRelativePath,ComputedGroup,ImageIndex,AxisX,AxisY,SourceSHA256,ReviewStatus\r\n','utf8');
  const authorityPath = path.join(packageRoot, PALETTE_PACKAGE_SEEDS[1]),authorityBytes = Buffer.from(`${JSON.stringify(authority, null, 2)}\n`, 'utf8');
  const markerPath=path.join(packageRoot,PALETTE_PACKAGE_MARKER),markerToken=randomBytes(32).toString('hex'),markerBytes=Buffer.from(`${JSON.stringify({schema:'ikemaker.palette-package-owner',version:1,token:markerToken,packageRoot:seal.real,manifestHash:sha(manifestBytes),authorityHash:sha(authorityBytes)},null,2)}\n`,'utf8');
  try {
    writeSet(io,[[manifestPath,manifestBytes],[authorityPath,authorityBytes],[markerPath,markerBytes]],{label:'palette-workshop-package-seed',allowExisting:false,backup:false,journal:false});
    if(!sealedSeed(io,seal,manifestBytes,authorityBytes,markerBytes))throw new Error('Palette Workshop package ownership seal changed before build preparation.');
    assertAuthority(authority);
    if(!sealedSeed(io,seal,manifestBytes,authorityBytes,markerBytes))throw new Error('Palette Workshop package ownership seal changed during authority revalidation.');
    const outputDirectory = path.join(packageRoot, 'build');
    const targetSnapshot = captureTarget(io, filename);
    const reviewedTarget=authority?.target;
    if(!reviewedTarget||pathKey(reviewedTarget.filename)!==pathKey(targetSnapshot.filename)||reviewedTarget.exists!==targetSnapshot.exists||reviewedTarget.byteHash!==targetSnapshot.hash||Number(reviewedTarget.byteLength)!==(targetSnapshot.exists?io.statSync(filename).size:0))throw new Error('Palette Workshop target changed after review. The package was not prepared.');
    const build = await buildPackage({
      sourceRoot: packageRoot, manifestPath, outputDirectory, outputSff: filename,
      candidateOutputSff: candidatePath(outputDirectory, filename), targetSnapshot,
      paletteSourceSff: filename, buildProfile: DEFAULT_PROFILE,
      duplicateHandling: { sprites: SEPARATE, palettes: SHARE }, preserveArchiveSprites: true,
      includeStagedPalettes: true,
      reviewEvidence: { identity: path.basename(authorityPath), byteHash: sha(authorityBytes) }
    });
    build.specificationArtifactByteHash = sha(io.readFileSync(build.specificationPath));
    return { packageRoot, build, targetId: `sff-v${authority.sffVersion}` };
  } catch (error) {
    const safe=path.dirname(packageRoot)===selectedRoot&&sealedSeed(io,seal,manifestBytes,authorityBytes,markerBytes)&&seedOnly(io,packageRoot);
    if(safe){try{io.rmSync(packageRoot,{recursive:true,force:true});}catch(cleanupError){throw retainedPackageError(error,packageRoot,`safe cleanup failed (${cleanupError.message})`);}}
    else if(io.existsSync(packageRoot))throw retainedPackageError(error,packageRoot,'its exact ownership seal, directory identity, or seed-only contents could not be proven');
    throw error;
  }
}

function resolveAssignedAsset(reference, owner) {
  const cleaned = String(reference || '').replace(/[\\/]/g, path.sep);
  if (!cleaned) throw new Error('The selected definition does not assign an SFF file.');
  const candidates = [path.resolve(path.dirname(owner), cleaned)];
  let current = path.dirname(owner);
  while (path.dirname(current) !== current) {
    if (fs.existsSync(path.join(current, 'data')) || fs.existsSync(path.join(current, 'Ikemen_GO.exe'))) {
      candidates.push(path.resolve(current, cleaned), path.resolve(current, 'data', cleaned), path.resolve(current, 'stages', cleaned));
      break;
    }
    current = path.dirname(current);
  }
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (!resolved) throw new Error(`The assigned SFF was not found: ${candidates[0]}`);
  return resolved;
}

function assignedSff(defPath) {
  const document = parseDef(fs.readFileSync(defPath, 'utf8'), defPath), type = kind(document);
  if (type === 'stage') return resolveAssignedAsset(stageModel(document).sff, defPath);
  if (type === 'screenpack' || type === 'lifebar') return resolveAssignedAsset(screenpackModel(document).sff, defPath);
  return characterSff(defPath);
}

function openSffPaletteWorkspace(sff, options = {}) {
  return paletteWorkspaceController().openTargetWorkspace(vscode.Uri.file(sff), { ...options, origin: options.origin || { surface: 'palette-workspace' } });
}

function activeCharacterDef() {
  const context = require('./authoring_context_registry').currentContext?.(), candidates = [];
  if (context?.type === 'character') for (const filename of context.files || []) if (/\.def$/i.test(filename) && isCharacterDef(filename)) candidates.push(path.resolve(filename));
  if (context?.type === 'character' && context.root && fs.existsSync(context.root)) for (const name of fs.readdirSync(context.root).filter(item => /\.def$/i.test(item))) { const filename = path.join(context.root, name); if (isCharacterDef(filename)) candidates.push(path.resolve(filename)); }
  const unique = [...new Set(candidates.map(filename => process.platform === 'win32' ? filename.toLowerCase() : filename))];
  return unique.length === 1 ? candidates.find(filename => (process.platform === 'win32' ? filename.toLowerCase() : filename) === unique[0]) || '' : '';
}

async function openCanonicalPaletteWorkspace(uri, options = {}) {
  const suppliedPath = uri?.fsPath || uri?.path || '';
  const extension = path.extname(suppliedPath).toLowerCase();
  if (/\.ikpalette\.json$/i.test(suppliedPath)) return paletteWorkspaceController().openScratchWorkspace(uri, options);
  if (extension === '.sff') return openSffPaletteWorkspace(suppliedPath, options);
  if (extension === '.act' || extension === '.png') return paletteWorkspaceController().openSourceWorkspace(uri, { section: options.section || 'sources-preflight', origin: { compatibilityAlias: options.compatibilityAlias || null } });
  if (extension === '.def') return openSffPaletteWorkspace(assignedSff(suppliedPath), options);
  const contextualDef = activeCharacterDef(); if (contextualDef) return openSffPaletteWorkspace(assignedSff(contextualDef), options);
  const target = await vscode.window.showQuickPick([
    { label: 'Create a standalone palette template image…', description: 'Use PNG artwork for any character without closing or changing the character that is currently open.', action: 'template' },
    { label: 'Create a new palette…', description: 'Start a lossless 256-color RGBA palette with transparent index 0 locked.', action: 'scratch' },
    { label: 'Resume a retained palette draft…', description: 'Return to an unsaved or saved scratch palette without losing its exact indexes.', action: 'scratch-resume' },
    { label: 'Open an IKEMaker palette document…', description: 'Continue a saved .ikpalette.json draft without losing alpha or index order.', action: 'scratch-open' },
    { label: 'Character Palette Workspace…', description: 'Choose a character, then manage the palette table of its assigned SFF.', action: 'character' },
    { label: 'Stage, screenpack, fight UI, or exact SFF…', description: 'Choose an identified owner or archive. IKEMaker opens only its assigned SFF.', action: 'visual-owner' },
    { label: 'Standalone ACT / indexed PNG…', description: 'Create, edit, inspect, or export a palette source without guessing a character.', action: 'standalone' }
  ], { title: 'Open Palette Workspace', placeHolder: 'Choose the palette context. IKEMaker will not guess a character for a standalone palette.' });
  if (!target) return;
  if (target.action === 'template') return paletteWorkspaceController().openStandaloneTemplateWorkspace(options);
  if (target.action === 'scratch') return paletteWorkspaceController().openScratchWorkspace(null, options);
  if (target.action === 'scratch-resume') return paletteWorkspaceController().resumeScratchWorkspace();
  if (target.action === 'scratch-open') { const picked=await vscode.window.showOpenDialog({title:'Open lossless IKEMaker palette document',canSelectMany:false,canSelectFiles:true,canSelectFolders:false,filters:{'IKEMaker palette document':['ikpalette.json']}});return picked?.[0]?paletteWorkspaceController().openScratchWorkspace(picked[0],options):undefined; }
  if (target.action === 'standalone') { const picked = await vscode.window.showOpenDialog({ title: 'Choose an ACT or indexed PNG palette source', canSelectMany: false, canSelectFiles: true, canSelectFolders: false, filters: { 'ACT or indexed PNG': ['act', 'png'] } }); return picked?.[0] ? openCanonicalPaletteWorkspace(picked[0], { section: options.section || 'sources-preflight' }) : undefined; }
  if (target.action === 'visual-owner') {
    const picked = await vscode.window.showOpenDialog({ title: 'Choose a stage, screenpack, fight UI, or exact SFF', canSelectMany: false, canSelectFiles: true, canSelectFolders: false, filters: { 'IKEMEN definition or SFF': ['def', 'sff'] } });
    if (!picked?.[0]) return;
    return openCanonicalPaletteWorkspace(picked[0], options);
  }
  const defPath = await chooseCharacterDef(uri, { title: 'Choose the character whose palettes you want to work with' });
  if (!defPath) return;
  return openSffPaletteWorkspace(characterSff(defPath));
}

async function openPlayerPaletteWorkspace(uri) {
  const supplied = uri?.fsPath || uri?.path || '';
  if (/\.(?:sff|def|act|png)$/i.test(supplied)) return openCanonicalPaletteWorkspace(uri, { section: 'embedded', compatibilityAlias: 'ikemen.palettePlayer.open' });
  const defPath = await chooseCharacterDef(uri, { title: 'Choose the character whose palettes you want to work with' });
  if (!defPath) return;
  return openSffPaletteWorkspace(characterSff(defPath));
}

function registerPlayerPaletteWorkspace(context) {
  configurePaletteWorkspaceService(context.workspaceState);
  configurePaletteWorkspaceController(context);
  require('./palette_workshop_browser').register(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('ikemen.palettePlayer.open', openPlayerPaletteWorkspace),
    vscode.commands.registerCommand('ikemen.palette.openWorkspace', openCanonicalPaletteWorkspace),
    vscode.commands.registerCommand('ikemen.palette.createTemplate', async (_uri, options) => {
      try { return await paletteWorkspaceController().openStandaloneTemplateWorkspace(options || {}); }
      catch (error) { vscode.window.showErrorMessage(`Palette Template: ${error.message}`); return undefined; }
    }),
    vscode.commands.registerCommand('ikemen.palette.focusWorkshopTool', (uri, options) => paletteWorkspaceController().focusTargetTool(uri, options || {})),
    vscode.commands.registerCommand('ikemen.palette.companionControl', (uri, action) => paletteWorkspaceController().invokeCompanionControl(uri, action || {})),
    vscode.commands.registerCommand('ikemen.palette.externalDrop', (uri, message) => paletteWorkspaceController().externalPaletteDrop(uri, message || {})),
    vscode.commands.registerCommand('ikemen.palette.createScratch', (_uri, options) => paletteWorkspaceController().openScratchWorkspace(null, options || {})),
    vscode.commands.registerCommand('ikemen.palette.resumeScratch', () => paletteWorkspaceController().resumeScratchWorkspace()),
    vscode.commands.registerCommand('ikemen.palettePlayer.organize', uri => vscode.commands.executeCommand('ikemen.palette.openWorkspace', uri, { section: 'organize', compatibilityAlias: 'ikemen.palettePlayer.organize' })),
    vscode.commands.registerCommand('ikemen.palettePlayer.finishStaged', async (uri) => {
      const filename = uri?.fsPath || uri?.path;
      if (!filename) {
        const message = 'Palette Workshop cannot build because no exact SFF target was supplied.';
        vscode.window.showErrorMessage(message);
        return { schema: 'ikemaker.palette-workshop-build-result', version: 1, status: 'failed', adopted: false, planRetained: true, message };
      }
      const service = paletteWorkspaceService();
      let route = null, attemptBegun = false, preferredPalette = null;
      try {
        service.beginBuildAttempt(filename);
        attemptBegun = true;
        preferredPalette=preferredStagedPalette(readPalettePlan(filename));
        route = await vscode.window.showQuickPick([
          { label: 'SprMake2 · Verify and Apply', description: 'Build privately, validate independently, then ask before replacing the active v2 SFF.', backend: 'sprmake2-adopt' },
          { label: 'IKEMaker built-in · Test candidate only', description: 'Create and validate a retained v2 candidate. Never replace the active SFF.', backend: 'builtin-test' }
        ], { title: 'Finish Reviewed Palette Build', placeHolder: 'Choose one explicit backend. IKEMaker never falls back to another writer.' });
        if (!route) { const result = { schema: 'ikemaker.palette-workshop-build-result', version: 1, status: 'cancelled', adopted: false, planRetained: true }; service.recordBuildResult(filename, result); return result; }
        service.updateBuildAttempt(filename, { status: 'running', backend: route.backend, message: 'Building and validating the reviewed plan…' });
        const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Palette Workshop reviewed build', cancellable: false }, () => runPaletteWorkshopBuild({ sffPath: filename, backend: route.backend }, {
          preparePackage: preparePaletteOnlyPackage,
          onState: async state => { if (state.status === 'reviewed') service.updateBuildAttempt(filename, { status: 'reviewed', backend: route.backend, message: 'Reviewed plan confirmed. Building and validating…' }); },
          confirmBuild: async ({ authority }) => await vscode.window.showWarningMessage('Build this exact reviewed palette plan?', { modal: true, detail: `${authority.sffVersion} target · ${(JSON.parse(authority.planSnapshot).palettes || []).length} staged palette(s) · ${(JSON.parse(authority.planSnapshot).deletions || []).length} deletion(s). The complete physical sprite inventory is retained.` }, 'Build Reviewed Plan') === 'Build Reviewed Plan',
          confirmAdoption: async ({ impact }) => await vscode.window.showWarningMessage('Apply the independently validated SprMake2 candidate?', { modal: true, detail: `This replaces the active SFF only now. Candidate impact: ${JSON.stringify(impact)}. A durable backup is retained.`, }, 'Apply Validated Candidate') === 'Apply Validated Candidate'
        }));
        service.recordBuildResult(filename, result);
        const selected=result.adopted?focusAdoptedPalette(service,filename,preferredPalette):null;
        if (result.status === 'adopted') {if(selected)vscode.window.showInformationMessage(`Palette build verified and applied. Selected palette ${selected.group},${selected.number} in ${path.resolve(filename)}; the completed staged plan was cleared.`);else vscode.window.showWarningMessage(`Palette build verified and applied to ${path.resolve(filename)}, but the staged palette could not be selected. Reopen the current SFF and choose the new palette.`);}
        else if (result.status === 'validated-test-candidate') vscode.window.showInformationMessage(`Built-in test candidate validated and retained. The active SFF and staged plan are unchanged: ${result.candidatePath}`);
        else if (result.status === 'adopted-cleanup-required') vscode.window.showWarningMessage(`The validated SFF was applied${selected?` and palette ${selected.group},${selected.number} is selected`:''}, but the staged-plan completion record could not be written. The plan was retained for recovery.`);
        else vscode.window.showInformationMessage('The active SFF was not changed. The staged palette plan was retained.');
        return result;
      } catch (error) {
        if (!attemptBegun) {
          let retained = null;
          try { retained = service.snapshot(filename)?.buildAttempt || null; } catch (_) {}
          const status = error.code === 'PALETTE_BUILD_BUSY' ? 'busy' : retained?.status === 'adopted-cleanup-required' ? 'adopted-cleanup-required' : 'failed';
          vscode.window.showErrorMessage(error.message);
          return { schema: 'ikemaker.palette-workshop-build-result', version: 1, status, backend: retained?.backend || '', adopted: Boolean(retained?.adopted), planRetained: retained?.planRetained !== false, candidatePath: retained?.candidatePath || '', receiptPath: retained?.receiptPath || '', message: error.message };
        }
        const result = error.paletteWorkshopResult || { schema: 'ikemaker.palette-workshop-build-result', version: 1, status: 'failed', backend: route?.backend || '', adopted: false, planRetained: true, message: error.message };
        try { service.recordBuildResult(filename, result); if(result.adopted)focusAdoptedPalette(service,filename,preferredPalette); } catch (_) {}
        vscode.window.showErrorMessage(error.message);
        return result;
      }
    })
  );
}

module.exports = { assignedSff, openCanonicalPaletteWorkspace, openPlayerPaletteWorkspace, registerPlayerPaletteWorkspace, preparePaletteOnlyPackage, preferredStagedPalette, focusAdoptedPalette, PALETTE_PACKAGE_MARKER };
