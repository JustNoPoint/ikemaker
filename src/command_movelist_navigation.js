'use strict';
function commandValues(c) {
 return {name:c.name,command:c.command,time:c.time,steptime:c.declaredStepTime,autogreater:c.autoGreater,bufferTime:c.bufferTime,bufferHitpause:c.bufferHitpause,bufferPauseend:c.bufferPauseend,bufferShared:c.bufferShared};
}
function findCommand(commands,ref) {
 if(ref?.tab!=='command'||!ref.command)return null;
 const matches=commands.filter(c=>Object.entries(commandValues(c)).every(([key,value])=>ref.command[key]===value));
 return matches.length===1?matches[0]:null;
}
function clientScript(){return `
 const historyCommandValues=${commandValues.toString()},historyFindCommand=${findCommand.toString().replace('commandValues(c)','historyCommandValues(c)')};
 let commandBaseline=JSON.stringify(values());
 const inspectBeforeHistory=inspect;inspect=()=>{inspectBeforeHistory();commandBaseline=JSON.stringify(values())};
 globalThis.ikemenNavigationSelection=()=>{const base=activeTab==='movelist'?{tab:'movelist',file:data.files.movelistFile}:selectedCommand()?{tab:'command',file:data.files.commandFile,command:historyCommandValues(selectedCommand())}:undefined;if(!base)return undefined;return connectionsVisible?{...base,view:'connections',connectionFilters:connectionFilterState(),connectionScrollTop:byId('connectionsWorkspace')?.querySelector?.('.connection-body')?.scrollTop||0}:{...base,view:activeTab}};
 globalThis.ikemenCanRestoreNavigation=ref=>{
  if(ref?.tab==='movelist')return !!ref.file&&ref.file===data.files.movelistFile;
  if(ref?.file!==data.files.commandFile)return false;
  const target=historyFindCommand(data.commands,ref);if(!target)return false;
  return target===selectedCommand()||JSON.stringify(values())===commandBaseline;
 };
 globalThis.ikemenRestoreNavigation=ref=>{
  if(!globalThis.ikemenCanRestoreNavigation(ref))throw new Error('Command unavailable, ambiguous, or current form has unapplied edits');
  if(ref.tab==='command'){
   const target=historyFindCommand(data.commands,ref);
   if(target!==selectedCommand()){selected=data.commands.indexOf(target);byId('commandSearch').value='';byId('commandView').value='all';list();inspect();saveCommandState();}
  }
  showTab(ref.tab);
  if(ref.view==='connections'){const filters=ref.connectionFilters||{};for(const [id,value] of [['connectionScope',filters.scope],['connectionRelation',filters.relation],['connectionStatus',filters.status]]){const control=byId(id);if(control&&Array.from(control.options||[]).some(option=>option.value===value))control.value=value}if(typeof filters.query==='string')byId('connectionFilter').value=filters.query;showConnections();const body=byId('connectionsWorkspace')?.querySelector?.('.connection-body');if(body&&Number.isFinite(ref.connectionScrollTop))body.scrollTop=Math.max(0,ref.connectionScrollTop)}
 };
 globalThis.addEventListener?.('message',event=>{
  const message=event.data;if(message?.type!=='commandSourceLine')return;
  if(message.file&&String(message.file).toLowerCase()!==String(data.files.commandFile||'').toLowerCase())return;
  const matches=message.referenceName?data.commands.filter(c=>c.name===message.referenceName):message.command?data.commands.filter(c=>Object.entries(historyCommandValues(c)).every(([key,value])=>message.command[key]===value)):[];
  const target=matches[Number(message.occurrence)||0]||(!message.command?data.commands.find(c=>message.line>=c.startLine&&message.line<c.endLine):null);if(!target)return;
  if(target!==selectedCommand()&&JSON.stringify(values())!==commandBaseline){byId('status').textContent='The command under the caret was not selected because the current visual command has unapplied edits.';return;}
  if(target!==selectedCommand()){byId('commandSearch').value='';byId('commandView').value='all';selectCommand(data.commands.indexOf(target));saveCommandState();}
  showTab('command');
 });
 `;}
module.exports={commandValues,findCommand,clientScript};
