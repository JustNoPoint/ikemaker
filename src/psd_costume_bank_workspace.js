'use strict';
const fs = require('fs'),
  path = require('path'),
  os = require('os');
const model = require('./psd_costume_bank_model');
const {
  parseSffBuffer,
  friendlyVersion
} = require('./sff_reader');
const {
  parseCsv
} = require('./sff');
const {
  transactionalWrite
} = require('./mutation_safety');
const sourceChoices = new Map();
const SILHOUETTE_ACTION = 'Save and review silhouette';

// Receiver contract: {expectedHash, bank, layerIds, baseIds}; ids are 'group,number'
// strings in matching order, taken from verified saved identities only.
function bakeRequestFor(expectedHash, bank, importedLayers) {
  if (!/^[0-9a-f]{64}$/.test(String(expectedHash || '')) || !Number.isInteger(bank) || bank < 1 || bank > 6) throw Error('Silhouette review needs the verified saved SFF hash and bank.');
  if (!Array.isArray(importedLayers) || !importedLayers.length) throw Error('No verified imported layers are available for silhouette review.');
  const id = /^\d{1,5},\d{1,5}$/, layerIds = [], baseIds = [];
  for (const row of importedLayers) {
    const [baseGroup, baseNumber] = String(row.baseId).split(',').map(Number), [layerGroup, layerNumber] = String(row.layerId).split(',').map(Number);
    if (!id.test(row.baseId) || !id.test(row.layerId) || layerGroup !== baseGroup + bank * 10000 || layerNumber !== baseNumber || baseGroup >= 10000) throw Error(`Imported layer ${row.layerId} does not match base ${row.baseId} in bank ${bank}.`);
    layerIds.push(row.layerId);
    baseIds.push(row.baseId);
  }
  if (new Set(layerIds).size !== layerIds.length) throw Error('Duplicate imported layer identity.');
  return { expectedHash, bank, layerIds, baseIds };
}

// Commit only the exact reviewed bytes under the currently admitted SFF owner.
// Recovery evidence is exclusive-create; shared mutation safety owns replacement
// rollback and retains originals if recovery itself cannot complete.
async function commitReviewedBank(vscode,{sffPath,original,candidate,expectedHash,afterHash,isCurrent}) {
  const {sealedRoot,assertSafeAncestors}=require('./palette_domain_registry');
  const root=sealedRoot(path.dirname(sffPath));
  const assertTarget=()=>{
    assertSafeAncestors(root,sffPath);
    if(!fs.existsSync(sffPath)||!fs.statSync(sffPath).isFile())throw Error('The assigned SFF is missing or not a regular file.');
    if((vscode.workspace.textDocuments||[]).some(doc=>!doc.isClosed&&doc.isDirty&&path.resolve(doc.fileName).toLowerCase()===path.resolve(sffPath).toLowerCase()))throw Error('The assigned SFF has unsaved document changes.');
    if(model.sha(original)!==expectedHash||model.sha(candidate)!==afterHash||model.sha(fs.readFileSync(sffPath))!==expectedHash)throw Error('The assigned SFF or reviewed bytes changed. No changes were saved.');
  };
  if(typeof isCurrent!=='function'||isCurrent()!==true)throw Error('The viewer target or pending edits changed. Reopen this import from the assigned SFF.');
  assertTarget();
  const backup=path.join(root,'.ikemen-tools','backups',path.basename(sffPath)+'.before-psd-bank-'+require('crypto').randomUUID()+'.bak');
  assertSafeAncestors(root,backup);
  fs.mkdirSync(path.dirname(backup),{recursive:true});
  assertSafeAncestors(root,backup);
  fs.writeFileSync(backup,original,{flag:'wx'});
  if(model.sha(fs.readFileSync(backup))!==expectedHash)throw Error('Backup verification failed. No SFF changes were saved.');
  transactionalWrite(fs,sffPath,candidate,{expectedHash,label:'psd-costume-bank',journal:true});
  if(model.sha(fs.readFileSync(sffPath))!==afterHash)throw Error('Saved SFF verification failed. Original backup: '+backup);
  return backup;
}


function nearbyBuilds(sffPath) {
  const root = path.join(path.dirname(sffPath), '.ikemen-tools', 'sff-creator-work'),
    found = [];
  if (!fs.existsSync(root)) return [];
  for (const entry of fs.readdirSync(root, {
      withFileTypes: true
    }).slice(0, 100)) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const build = path.join(root, entry.name, 'build');
    if (!fs.existsSync(build) || fs.lstatSync(build).isSymbolicLink()) continue;
    for (const name of fs.readdirSync(build).slice(0, 200))
      if (/^reviewed-sff-build-specification.*\.json$/i.test(name)) found.push(path.join(build, name));
  }
  return found.sort();
}

function extractInWorker(job, progress) {
  return new Promise((resolve, reject) => {
    const child = require('child_process').fork(path.join(__dirname, 'psd_costume_bank_worker.js'), [], {
      windowsHide: true,
      serialization: 'advanced',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1'
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc']
    });
    let settled = false;
    child.on('error', error => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on('exit', code => {
      if (!settled) {
        settled = true;
        reject(Error(`PSD extraction stopped (${code}).`));
      }
    });
    child.on('message', message => {
      if (message.progress) progress.report({
        message: `${message.progress.i}/${message.progress.total}: ${message.progress.file}`
      });
      else if (message.error) {
        settled = true;
        reject(Error(message.error));
      } else if (message.result) {
        settled = true;
        resolve(message.result);
      }
    });
    child.send(job);
  });
}
async function openPsdCostumeBank(options = {}) {
  const vscode = options.vscode || require('vscode');
  let temporary;
  try {
    if (vscode.workspace.isTrusted === false) throw Error('Trust this local workspace before extracting PSD layers.');
    if (!options.sffPath) throw Error('Open the assigned character SFF first.');
    const sffPath = path.resolve(options.sffPath),
      original = fs.readFileSync(sffPath),
      expectedHash = model.sha(original);
    if (options.expectedHash && options.expectedHash !== expectedHash) throw Error('The assigned SFF changed. Reload its viewer first.');
    const archive = parseSffBuffer(original);
    if (friendlyVersion(archive.header.version) !== '2.1') throw Error('This importer requires SFF 2.1. Convert a copy in SFF Creator first.');
    const remembered = sourceChoices.get(sffPath) || {};
    const choose = async (title, filters, folder = false, suggestion) => {
      const files = await vscode.window.showOpenDialog({
        title,
        canSelectFiles: !folder,
        canSelectFolders: folder,
        canSelectMany: false,
        filters,
        defaultUri: vscode.Uri.file(suggestion && fs.existsSync(suggestion) ? suggestion : path.dirname(sffPath))
      });
      return files?.[0]?.fsPath;
    };
    const builds = nearbyBuilds(sffPath);
    let jsonPath;
    if (builds.length > 1 && !remembered.jsonPath) {
      const choices = builds.map(file => ({
        label: path.basename(path.dirname(path.dirname(file))),
        description: fs.statSync(file).mtime.toLocaleString(),
        detail: path.basename(file),
        file
      }));
      choices.push({
        label: 'Browse for another build JSON…'
      });
      const picked = await vscode.window.showQuickPick(choices, {
        title: '1/4 — Choose the saved SFF build for this character',
        matchOnDetail: true
      });
      if (!picked) return;
      jsonPath = picked.file;
    }
    if (!jsonPath) jsonPath = await choose('1/4 — Choose the saved reviewed SFF build specification JSON', {
      JSON: ['json']
    }, false, remembered.jsonPath || builds[0]);
    if (!jsonPath) return;
    const psdFolder = await choose('2/4 — Choose the original PSD folder', undefined, true, remembered.psdFolder);
    if (!psdFolder) return;
    const csvPath = await choose('3/4 — Choose the approved filename → sprite mapping manifest CSV', {
      CSV: ['csv']
    }, false, remembered.csvPath);
    if (!csvPath) return;
    const layer = await vscode.window.showQuickPick([{
      label: 'Matching optional Layer 1 / beard',
      description: 'Separate next labelled layer after base; missing pages are skipped',
      value: ''
    }, {
      label: 'Exact named layer',
      description: 'Use the same explicit PSD layer name in each source',
      value: null
    }], {
      title: '4/4 — Choose overlay artwork'
    });
    if (!layer) return;
    let layerName = layer.value;
    if (layerName === null) {
      layerName = await vscode.window.showInputBox({
        title: 'Exact PSD overlay layer name',
        prompt: 'For example Beard. Raw layer pixels are placed at their original canvas offsets.',
        validateInput: v => v.trim() ? undefined : 'Enter a layer name.'
      });
      if (!layerName) return;
      layerName = layerName.trim();
    }
    const spec = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const colorMode = await vscode.window.showQuickPick([{
      label: 'Follow body palette (recommended)',
      description: 'Exact master-color indexing; beard changes with character palettes',
      value: 'indexed'
    }, {
      label: 'Own independent palette',
      description: 'One indexed palette shared by these overlay frames; exact colors, index 0 transparent; ignores costume palettes',
      value: 'independent'
    }, {
      label: 'Keep exact source colors',
      description: 'Fixed PNG32 colors; does not follow character palette changes',
      value: 'rgba'
    }], {
      title: 'How should the overlay use colors?'
    });
    if (!colorMode) return;
    const matches = model.matchSources(spec, parseCsv(fs.readFileSync(csvPath, 'utf8')), psdFolder, archive);
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-psd-bank-'));
    const executable = vscode.workspace.getConfiguration('ikemenZss', vscode.Uri.file(sffPath)).get('imageMagickPath', 'magick');
    const extracted = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Reviewing original PSD overlay layers',
      cancellable: false
    }, async progress => extractInWorker({
      matches,
      directory: temporary,
      layerName,
      executable
    }, progress));
    let colorEvidence = {
      mode: 'exact-source-colors'
    };
    if (colorMode.value === 'indexed') {
      const indexed = await model.prepareIndexed(vscode, spec, archive, extracted.sprites);
      if (!indexed) return;
      extracted.sprites = indexed.sprites;
      extracted.skipped.push(...indexed.skipped);
      colorEvidence = indexed.evidence;
    }
    let independent = null;
    if (colorMode.value === 'independent') {
      const alpha = model.independentAlphaReview(extracted.sprites);
      let partialAlpha = 'reject';
      if (alpha.partialPixels) {
        const decision = await vscode.window.showQuickPick([{
          label: alpha.alphaChanges.toOpaque ? 'Threshold partial alpha at 128' : 'Make faint edge pixels transparent',
          description: `Explicit pixel change in ${alpha.frames.length} frame(s): ${alpha.alphaChanges.toTransparent} become transparent, ${alpha.alphaChanges.toOpaque} become opaque`,
          value: 'threshold'
        }], {
          title: 'Indexed palettes cannot store partial alpha exactly'
        });
        if (!decision) return;
        partialAlpha = decision.value;
      }
      independent = model.prepareIndependent(extracted.sprites, { partialAlpha });
      extracted.sprites = independent.sprites;
      colorEvidence = independent.evidence;
    }
    const resolveFor = independent ? bank => model.resolveIndependentPalette(archive, independent, bank) : undefined;
    const suggested = model.suggestBank(archive, extracted.sprites, resolveFor);
    const bankText = await vscode.window.showInputBox({
      title: 'Costume bank',
      value: String(suggested),
      prompt: `Recommended bank ${suggested}: base group +${suggested*10000}, same sprite index. This is the first compatible bank. Identical imports are reused and collisions are blocked.`,
      validateInput: v => /^[1-6]$/.test(v) ? undefined : 'Choose 1 through 6 (bank 6 requires all destination groups ≤65535).'
    });
    if (!bankText) return;
    const resolved = resolveFor ? resolveFor(Number(bankText)) : null;
    if (resolved) {
      extracted.sprites = resolved.sprites;
      colorEvidence = {
        ...colorEvidence,
        palette: {
          id: resolved.palette.id,
          physicalIndex: resolved.palette.index,
          reused: resolved.palette.reused,
          colorsHash: resolved.palette.colorsHash,
          colors: resolved.palette.colors.slice(0, colorEvidence.opaqueColors + 1)
        }
      };
    }
    const plan = model.planBank(archive, extracted.sprites, Number(bankText), resolved ? { palette: resolved.palette } : {}),
      candidate = model.appendBank(archive, plan);
    const review = {
      schema: 'ikemaker.psd-costume-bank-review',
      version: 1,
      sffPath,
      beforeHash: expectedHash,
      afterHash: model.sha(candidate),
      bank: plan.bank,
      groupOffset: plan.bank * 10000,
      layer: layerName || 'Matching optional Layer 1 / beard',
      jsonPath,
      psdFolder,
      csvPath,
      added: plan.additions.length,
      reused: plan.equivalent.length,
      promoted: plan.promotions.length,
      colorEvidence,
      skipped: extracted.skipped,
      rawLayerSnapshots: true,
      axes: 'Copied exactly from matching saved JSON and destination base sprite',
      sprites: [...plan.promotions.map(s => ({
        ...s,
        status: 'promote-exact-source-PNG32-to-indexed'
      })), ...plan.additions.map(s => ({
        ...s,
        status: 'add'
      })), ...plan.equivalent.map(s => ({
        ...s,
        status: 'reuse'
      }))].map(({
        png,
        masterColors,
        ...s
      }) => s)
    };
    const changed = review.afterHash !== expectedHash;
    review.layoutRepair = changed && !review.added && !review.promoted;
    const document = await vscode.workspace.openTextDocument({
      language: 'json',
      content: JSON.stringify(review, null, 2)
    });
    await vscode.window.showTextDocument(document, {
      preview: true
    });
    const action = await vscode.window.showInformationMessage(`PSD bank ${plan.bank}: ${review.added} new, ${review.promoted} exact-source PNG32 imports promoted to ${independent?'the independent palette '+colorEvidence.palette.id:'follow body palette'},${independent?(colorEvidence.palette.reused?' reusing':' adding')+' independent palette '+colorEvidence.palette.id+' ('+colorEvidence.opaqueColors+' exact colors, index 0 transparent),':''} ${review.reused} identical existing, ${review.skipped.length} skipped.${review.layoutRepair?' Existing archive layout will be repaired without changing sprite pixels, links or axes.':''} Read the open review manifest before approving: every ID, axis and skip is listed. Destination: ${sffPath}. Raw layers ignore layer visibility, opacity and blend styling.`, {
      modal: false
    }, review.promoted ? 'Save reviewed palette promotion' : review.added ? 'Save reviewed bank' : changed ? 'Save repaired SFF' : 'Use existing bank', SILHOUETTE_ACTION);
    if (!action) return;
    const reviewSilhouette = action === SILHOUETTE_ACTION;
    // Validate the handoff against the reviewed bytes before writing, so a contract
    // failure can never surface only after the SFF has changed.
    const plannedBake = reviewSilhouette ? bakeRequestFor(review.afterHash, plan.bank, model.importedLayerIdentities(candidate, plan)) : undefined;
    if (options.isCurrent && !(await options.isCurrent())) throw Error('The viewer target or pending edits changed. Reopen this import from the assigned SFF.');
    if (model.sha(fs.readFileSync(sffPath)) !== expectedHash) throw Error('The assigned SFF changed during review. No changes were saved.');
    let backup;
    if (changed) {
      backup=await commitReviewedBank(vscode,{sffPath,original,candidate,expectedHash,afterHash:review.afterHash,isCurrent:options.isCurrent});
    }
    sourceChoices.set(sffPath, {
      jsonPath,
      psdFolder,
      csvPath
    });
    // Identities come from the verified on-disk bytes, never from the in-memory candidate alone.
    const saved = fs.readFileSync(sffPath);
    if (model.sha(saved) !== review.afterHash) throw Error('Saved SFF verification failed before reporting imported layers.' + (backup ? ' Original backup: ' + backup : ''));
    if (changed) {
      const warning = require('./sff_quick_layer_admission').continueSavedBatches(sffPath,archive,saved);
      if (warning) void vscode.window.showWarningMessage('The PSD layer bank was saved. '+warning);
    }
    const importedLayers = model.importedLayerIdentities(saved, plan);
    const bakeRequest = reviewSilhouette ? bakeRequestFor(review.afterHash, plan.bank, importedLayers) : undefined;
    if (reviewSilhouette && JSON.stringify(bakeRequest) !== JSON.stringify(plannedBake)) throw Error('Saved layer identities differ from the reviewed silhouette request. The bank was saved; reopen silhouette review from the viewer.' + (backup ? ' Original backup: ' + backup : ''));
    void vscode.window.showInformationMessage(`PSD costume bank ${plan.bank} ready: ${review.added} added, ${review.promoted} promoted to ${independent?'independent palette '+colorEvidence.palette.id:'follow body palette'}, ${review.reused} reused.${backup?' Backup: '+backup:''}`);
    return {
      bank: plan.bank,
      label: layerName || 'PSD layer',
      added: review.added,
      reused: review.reused,
      promoted: review.promoted,
      skipped: review.skipped.length,
      backup,
      sffPath,
      palette: independent ? colorEvidence.palette.id : undefined,
      importedLayers,
      // Only when chosen: the viewer opens a separate silhouette review for exactly these rows.
      bakeRequest
    };
  } catch (error) {
    await vscode.window.showErrorMessage(`PSD costume bank: ${error.message}`);
    return undefined;
  } finally {
    if (temporary) fs.rmSync(temporary, {
      recursive: true,
      force: true
    });
  }
}
module.exports = {
  openPsdCostumeBank,commitReviewedBank,bakeRequestFor,SILHOUETTE_ACTION
};

