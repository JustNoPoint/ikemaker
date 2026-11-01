'use strict';
const assert=require('assert'),Module=require('module');
const original=Module._load;
class TreeItem{constructor(label,state){this.label=label;this.collapsibleState=state;}}
Module._load=function(request,parent,main){if(request==='vscode')return{TreeItem,TreeItemCollapsibleState:{Collapsed:1,None:0},workspace:{getConfiguration:()=>({get:(_k,f)=>f})}};return original.call(this,request,parent,main)};
const registry=require('../src/viewer_action_registry'),toolbar=require('../src/viewer_toolbar'),guided=require('../src/guided_workflows'),hub=require('../src/ikemen_hub'),manifest=require('../package.json');Module._load=original;

const catalog=registry.publicCommandCatalog(manifest),accounted=new Set([...catalog.actions.map(item=>item.command),...catalog.exclusions.map(item=>item.command)]),contributed=manifest.contributes.commands.map(item=>item.command);
assert.strictEqual(accounted.size,contributed.length,'every contributed command has exactly one public action or explicit exclusion');
assert.deepStrictEqual([...accounted].sort(),[...contributed].sort());
assert.strictEqual(new Set(catalog.actions.map(item=>item.actionId)).size,catalog.actions.length);
assert.strictEqual(new Set(catalog.exclusions.map(item=>item.command)).size,catalog.exclusions.length);
for(const alias of registry.OBSOLETE_ALIASES){assert(!catalog.actions.some(item=>item.command===alias));assert(catalog.exclusions.some(item=>item.command===alias&&item.reason));}
assert.deepStrictEqual(catalog.menuOrder,registry.MENU_ORDER);
for(const group of registry.MENU_ORDER)assert(catalog.actions.some(action=>action.group===group),`${group} has at least one public sidebar action`);
assert.strictEqual(catalog.actions.find(action=>action.command==='zss.toggleLineComment').group,'Edit');
assert.strictEqual(catalog.actions.find(action=>action.command==='ikemen.visualBrowser.open').group,'View');

for(const surface of ['shared','sff','air','snd','stage','screenpack','project_manager']){
 const menus=toolbar.menuDefinitions(surface),items=menus.flatMap(group=>group.items).filter(item=>!item.separator),commandItems=menus.flatMap(group=>group.items.filter(item=>item.command).map(item=>({group:group.label,item}))),commands=commandItems.map(entry=>entry.item.command),represented=new Set([...commands,...items.filter(item=>item.targetAction?.startsWith('command.')).map(item=>item.targetAction.slice('command.'.length))]);
 assert.deepStrictEqual(menus.map(group=>group.label),registry.MENU_ORDER,`${surface} uses canonical menu order`);
 const byCommand=new Map();for(const entry of commandItems)byCommand.set(entry.item.command,[...(byCommand.get(entry.item.command)||[]),entry]);for(const [command,entries] of byCommand)if(entries.length>1){assert.strictEqual(entries.length,2,`${surface} ${command} has only one specialist route plus one Build shortcut`);assert(entries.some(entry=>entry.group==='Build'&&entry.item.id.startsWith('shared.build.')),`${surface} ${command} duplicates only through the reviewed Build shortcut`);}
 for(const action of catalog.actions)assert(represented.has(action.command),`${surface} exposes ${action.command}`);
 for(const group of ['Stage','Screenpack'])assert(menus.find(item=>item.label===group).items.some(item=>!item.separator),`${surface} includes core ${group}`);
 const html=toolbar.menuHtml(surface);assert(!html.includes('data-toolbar-command=')&&!html.includes('data-toolbar-seed='),'client DOM carries action IDs, not command authority');
 assert(!/Experimental|\bBeta\b/i.test(html),'obsolete beta labels stay out of production menus');
}
for(const surface of ['sff','air','snd','stage','screenpack'])for(const action of guided.ADVANCED_ACTIONS[surface]||[])assert(toolbar.menuDefinitions(surface).find(group=>group.label==='Tools').items.some(item=>item.workflowAction===action.action),`${surface} advanced action moved into Tools`);
assert.strictEqual(guided.advancedActionBarHtml('sff',{mode:'advanced'}),'','separate Advanced action bars are retired');
const client=toolbar.clientScript();assert(client.includes("type:'viewerToolbarAction',actionId:button.dataset.toolbarActionId"));assert(!client.includes("type:'viewerToolbarCommand'"));assert(!client.includes("type:'viewerToolbarCrossSurface',source"));
const hubRoots=hub.buildHubItems(),catalogRoots=hubRoots.slice(1),hubActions=catalogRoots.flatMap(group=>group.children||[]);assert.strictEqual(hubRoots[0].label,'Quick Start');assert.deepStrictEqual(catalogRoots.map(item=>item.label),registry.MENU_ORDER);assert.strictEqual(new Set(hubActions.map(item=>item.actionId)).size,catalog.actions.length);assert.deepStrictEqual(hubActions.map(item=>item.actionId).sort(),catalog.actions.map(item=>item.actionId).sort());
const palette=manifest.contributes.menus.commandPalette||[];for(const alias of registry.OBSOLETE_ALIASES)assert(palette.some(item=>item.command===alias&&item.when==='false'),`${alias} remains registered but hidden`);assert(!manifest.contributes.viewsContainers?.panel?.some(item=>item.id==='ikemenDockingPrototype'));assert(!Object.prototype.hasOwnProperty.call(manifest.contributes.views||{},'ikemenDockingPrototype'),'prototype panel/views are no longer public UI');
console.log('F2 canonical command catalog, menu order, advanced-action convergence, host intent and hub/package parity passed');
