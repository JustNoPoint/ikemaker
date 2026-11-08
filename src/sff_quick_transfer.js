'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readSff, spriteDataUri } = require('./sff_reader');
const { createTransferSession, createTransferRequest, stageTransferReview } = require('./asset_transfer_session');
const { createSffTransferAssemblySeed } = require('./sff_transfer_assembly_adapter');
const { analyzeSffTransferConflicts } = require('./sff_transfer_conflict_model');
const { planSffTransferResolution } = require('./sff_transfer_resolution_model');

async function pickSprites(source, destination) {
  const rows = source.sprites.map(sprite => ({
    label: sprite.group + ',' + sprite.number,
    description: sprite.width + ' × ' + sprite.height + ' · physical ' + sprite.index,
    physicalIndex: sprite.index, group: sprite.group, number: sprite.number
  }));
  return require('./quick_transfer_picker').pickTransferRows({
    kind: 'sff', source: source.filename, destination: destination.filename, rows, maxSelection:512, allowTargetId:true, allowConflictPolicy:true,
    getPreview: row => spriteDataUri(source, source.sprites[row.physicalIndex])
  });
}

function standaloneReview(source, destination, selection) {
  const session = createTransferSession({kind:'sff', source, destination, sourceSelection:selection});
  const request = createTransferRequest(session, {method:'copy-selected'});
  return stageTransferReview(session, request, {status:'ready', reviewFingerprint:request.requestIdentity, summary:'Quick Transfer'});
}

async function applyQuickSprites(vscode, session, isCurrent, completed, rows) {
  const { assemblyReference, validReference } = require('./sff_assembly_workspace');
  const sourceFile = session.source.fileIdentity, targetFile = session.destination.fileIdentity;
  const reference = assemblyReference(targetFile, sourceFile);
  const sourceArchive = readSff(sourceFile), destinationArchive = readSff(targetFile);
  const seed = createSffTransferAssemblySeed({reference, session, sourceArchive, destinationArchive});
  const analysis = analyzeSffTransferConflicts({seed, sourceArchive, destinationArchive});
  const decisions = await require('./sff_transfer_decision_ui').collectSffTransferDecisions(vscode, analysis, destinationArchive, {append:true,rows:new Map(rows.map(row=>[row.physicalIndex,row]))});
  if (!decisions) return;
  const current = () => isCurrent() && Boolean(validReference(reference));
  if (!current()) throw Error('The source or destination changed. Reopen Quick Transfer to review the current sprites.');
  const resolution = planSffTransferResolution({analysis, decisions, destinationArchive});
  if (!resolution.readyForApply) throw Error('The selected sprites still have unresolved transfer decisions.');
  const count = resolution.items.filter(item=>item.action==='copy').length;
  if (!count) return vscode.window.showInformationMessage('All queued sprites were skipped.');
  const packageRoot = fs.mkdtempSync(path.join(os.tmpdir(),'ikemaker-quick-sff-'));
  const prepared = await require('./sff_transfer_apply').prepareSffTransferBuild({packageRoot,seed,analysis,resolution,sourceArchive,destinationArchive});
  if (!current()) throw Error('Transfer endpoints changed before building the sprites.');
  const result = await require('./sff_commands').executeGeneratedBuild(prepared.generated, {
    confirmAdoption: async () => {
      if (!current()) return false;
      const reply = await vscode.window.showWarningMessage('Apply Quick Transfer to '+path.basename(targetFile)+'?', {
        modal:true,detail:count+' copied or replaced sprite(s) · '+(resolution.items.length-count)+' skipped.\n'+targetFile
      },'Apply verified sprites');
      return reply==='Apply verified sprites' && current();
    }
  });
  if (result.cancelled) return;
  await completed({seed,resolution,prepared,result});
  await vscode.window.showInformationMessage('Quick Transfer applied '+count+' verified sprite(s) to '+path.basename(targetFile)+'.');
}

module.exports={pickSprites, standaloneReview, applyQuickSprites};
