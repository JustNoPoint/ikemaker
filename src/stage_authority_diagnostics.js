'use strict';
// Explicitly opt-in, bounded local diagnostics. No ordinary-workflow log file.
function record(api,event){try{if(process.env.IKEMAKER_STAGE_AUTHORITY_DEBUG!=='1'&&api.workspace?.getConfiguration?.('ikemenZss')?.get?.('stageAuthorityDiagnostics',false)!==true)return;const fs=require('fs'),file=require('path').join(require('os').tmpdir(),'ikemaker-stage-authority-diagnostics.jsonl');if(!fs.existsSync(file)||fs.statSync(file).size<262144)fs.appendFileSync(file,JSON.stringify({time:new Date().toISOString(),pid:process.pid,...event})+'\n');}catch{}}
module.exports={record};
