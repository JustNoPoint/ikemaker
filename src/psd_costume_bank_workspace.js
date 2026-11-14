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
    const suggested = model.suggestBank(archive, extracted.sprites);
    const bankText = await vscode.window.showInputBox({
      title: 'Costume bank',
      value: String(suggested),
      prompt: `Recommended bank ${suggested}: base group +${suggested*10000}, same sprite index. This is the first compatible bank. Identical imports are reused and collisions are blocked.`,
      validateInput: v => /^[1-6]$/.test(v) ? undefined : 'Choose 1 through 6 (bank 6 requires all destination groups ≤65535).'
    });
    if (!bankText) return;
    const plan = model.planBank(archive, extracted.sprites, Number(bankText)),
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
    const action = await vscode.window.showInformationMessage(`PSD bank ${plan.bank}: ${review.added} new, ${review.promoted} exact-source PNG32 imports promoted to follow body palette, ${review.reused} identical existing, ${review.skipped.length} skipped.${review.layoutRepair?' Existing archive layout will be repaired without changing sprite pixels, links or axes.':''} Read the open review manifest before approving: every ID, axis and skip is listed. Destination: ${sffPath}. Raw layers ignore layer visibility, opacity and blend styling.`, {
      modal: false
    }, review.promoted ? 'Save reviewed palette promotion' : review.added ? 'Save reviewed bank' : changed ? 'Save repaired SFF' : 'Use existing bank');
    if (!action) return;
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
    void vscode.window.showInformationMessage(`PSD costume bank ${plan.bank} ready: ${review.added} added, ${review.promoted} promoted to follow body palette, ${review.reused} reused.${backup?' Backup: '+backup:''}`);
    return {
      bank: plan.bank,
      label: layerName || 'PSD layer',
      added: review.added,
      reused: review.reused,
      promoted: review.promoted,
      skipped: review.skipped.length,
      backup,
      sffPath
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
  openPsdCostumeBank,commitReviewedBank
};

