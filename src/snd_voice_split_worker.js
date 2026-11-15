'use strict';
const {parentPort}=require('node:worker_threads');
parentPort.on('message',async message=>{try{parentPort.postMessage({result:await require('./snd_voice_split_file').analyzeFile(message.filename,message.options)});}catch(error){parentPort.postMessage({error:error.message});}});
