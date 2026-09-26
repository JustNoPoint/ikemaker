'use strict';
const levels=require('../data/interface-capabilities.json');
const player=new Set(levels.player),simple=new Set(levels.simple);
function minimum(command){return player.has(command)?'player':simple.has(command)?'simple':'workspace';}
function allows(command,mode=require('./interface_mode').current(),setup=require('./workspace_setup').current()){const base=mode==='workspace'||minimum(command)==='player'||mode==='simple'&&minimum(command)==='simple';return base&&(mode!=='workspace'||require('./workspace_setup').visible(command,setup));}
function condition(command){const level=minimum(command);return level==='player'?'':level==='simple'?"ikemen.interfaceMode != player":"ikemen.interfaceMode == workspace";}
function commandStyle(mode=require('./interface_mode').current()){const setup=require('./workspace_setup').current(),blocked=require('../package.json').contributes.commands.filter(item=>!allows(item.command,mode,setup)),selectors=blocked.flatMap(item=>['[data-command="'+item.command+'"]','[data-run-command="'+item.command+'"]']);for(const control of require('./workspace_setup').mapping.teamControls)if(!require('./workspace_setup').controlVisible(control,setup))selectors.push('[data-workspace-control="'+control+'"]');return selectors.length?selectors.join(',')+'{display:none!important}':'';}
module.exports={minimum,allows,condition,commandStyle};
