'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {parseArgs} = require('node:util');
const {loadSnapshotReviewEvidence, entityId, readBoundedFile} = require('../src/snapshot_review_evidence');
const {buildSnapshotFinding} = require('../src/snapshot_finding_export');
const {bindingReceiptPath}=require('../src/snapshot_binding');

const usage = [
  'node tools/export_snapshot_finding.js link <pair.json> <one-frame-clip.json> <retained-view.json> <findings.json> <new-clip.json>',
  'node tools/export_snapshot_finding.js inspect <pair-verdict.json>',
  'node tools/export_snapshot_finding.js export <pair-verdict.json> <new-findings.json>',
  '  --project-id <ID> --project-root <absolute-folder> --entity <kind:id>',
  '  [--target air|sprite] [--message <symptom> [--severity info|warning|error]]',
  '  or --target source --authored-cns <project-relative-path> --dest-line <one-based-line>'
].join('\n');

function main(argv) {
  const [command,...args] = argv;
  if (command === 'link' && args.length === 5) {
    const [pairFile,clipFile,viewFile,findingsFile,output] = args;
    if (!/\.json$/i.test(output) || /^[\\/]{2}/.test(path.resolve(output))) throw Error('Choose a new local .json clip file');
    const {associateSnapshotClip} = require('../src/snapshot_clip_link');
    const clip = associateSnapshotClip({pairFile,clipFile,viewFile,findingsFile});
    fs.writeFileSync(path.resolve(output),JSON.stringify(clip)+'\n',{encoding:'utf8',flag:'wx'});
    console.log(path.resolve(output));
    return;
  }
  if (command === 'inspect' && args.length === 1) {
    const {verdict,first} = loadSnapshotReviewEvidence(args[0]);
    console.log(`Snapshot pair ${verdict.id} · frozen tick ${verdict.tick}`);
    const receipt=bindingReceiptPath(path.dirname(fs.realpathSync(args[0])),verdict.id);
    if(fs.existsSync(receipt)){
      try{
        const body=JSON.parse(readBoundedFile(receipt,256*1024));
        if(!['bound','unbound'].includes(body.status))throw Error('Unknown receipt status');
        console.log(`Recorded capture-time binding ${body.status}. Export checks current asset eligibility.`);
      }catch{console.log('Binding receipt is unreadable. The Snapshot evidence is still available.');}
    }
    for (const entity of first.frame.entities) {
      const id = entityId(entity);
      if (!Number.isSafeInteger(id) || id < 0) continue;
      const owner = Number.isSafeInteger(entity.owner) ? `P${entity.owner}` : 'owner unavailable';
      const action = Number.isSafeInteger(entity.anim) ? entity.anim : 'unavailable';
      console.log(`${entity.kind}:${id} · ${owner} · action ${action}`);
    }
    return;
  }
  if (command !== 'export') throw Error(usage);
  const {positionals,values} = parseArgs({args,allowPositionals:true,options:{
    'project-id':{type:'string'},'project-root':{type:'string'},entity:{type:'string'},message:{type:'string'},severity:{type:'string'},target:{type:'string'},
    'authored-cns':{type:'string'},'dest-line':{type:'string'}
  }});
  const selection = /^(player|helper|projectile):([0-9]+)$/.exec(values.entity || '');
  if (positionals.length !== 2 || !selection) throw Error(usage);
  const [verdictFile,output] = positionals;
  if (!/\.json$/i.test(output)) throw Error('Choose a new .json file for the export');
  const authoredSource = values.target === 'source'
    ? {path:values['authored-cns'],line:Number(values['dest-line'])} : null;
  if (authoredSource ? (!authoredSource.path || !/^[1-9]\d*$/.test(values['dest-line'] || ''))
    : (values['authored-cns'] !== undefined || values['dest-line'] !== undefined)) throw Error(usage);
  const evidence = loadSnapshotReviewEvidence(verdictFile);
  const findings = buildSnapshotFinding(evidence,{
    entityKind:selection[1],entityId:Number(selection[2]),projectId:values['project-id'],
    projectRoot:values['project-root'],message:values.message,severity:values.severity,target:values.target,pairFile:verdictFile,authoredSource
  });
  const filename = path.resolve(output);
  fs.writeFileSync(filename,JSON.stringify(findings,null,2)+'\n',{encoding:'utf8',flag:'wx'});
  console.log(filename);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  console.error(error.code === 'EEXIST' ? 'Choose a new file. The existing findings file was kept.' : error.message);
  process.exitCode = 1;
}
