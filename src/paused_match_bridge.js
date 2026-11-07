'use strict';
const fs=require('fs'),path=require('path');
function lua(value){if(typeof value==='string')return '"'+value.replace(/\\/g,'/').replace(/"/g,'\\"')+'"';return '{'+Object.entries(value).map(([key,v])=>key+'='+lua(v)).join(',')+'}'}
module.exports={runtime:config=>fs.readFileSync(path.join(__dirname,'paused_match_bridge.lua'),'utf8').replace('__CONFIG__',lua(config))};
