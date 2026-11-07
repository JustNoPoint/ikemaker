'use strict';

const def = require('./def_model');
const {appendSection} = require('./visual_def_authoring');

const pages = [
  ['Title menu', 'Title Info', {'menu.pos':'160, 120', 'menu.item.font':'1, 0, 0', 'menu.item.spacing':'0, 14'}],
  ['Options', 'Option Info', {'menu.pos':'160, 80', 'menu.item.font':'1, 0, 0', 'menu.item.spacing':'0, 14'}],
  ['Character select', 'Select Info', {rows:'2', columns:'5', pos:'0, 0', 'cell.size':'25, 25', 'cell.spacing':'2'}],
  ['Versus', 'VS Screen', {time:'150', 'match.text':'Match %i', 'match.offset':'160, 20'}],
  ['Victory', 'Victory Screen', {enabled:'1', 'p1.face.offset':'0, 0'}],
  ['Continue', 'Continue Screen', {enabled:'1', pos:'160, 120'}],
  ['Pause menu', 'Pause Menu', {enabled:'1','menu.pos':'160, 90','menu.item.font':'1, 0, 0'}]
];
const hudPages = [
  ['Lifebars', 'Lifebar', {'p1.pos':'0, 0','p2.pos':'0, 0'}],
  ['Power bars', 'Powerbar', {'p1.pos':'0, 0','p2.pos':'0, 0'}],
  ['Small portraits', 'Face', {'p1.pos':'0, 0','p2.pos':'0, 0'}],
  ['Match timer', 'Time', {pos:'160, 10','counter.font':'1, 0, 0'}],
  ['Player names', 'Name', {'p1.pos':'0, 0','p1.name.font':'1, 0, 1','p2.pos':'0, 0','p2.name.font':'1, 0, -1'}]
];
const modes = {arcade:'Arcade', teamarcade:'Team Arcade', versus:'Versus', training:'Training', survival:'Survival', options:'Options'};

function menuGroups(entries) {
  const groups = new Map([['', []]]);
  const labels = new Map();
  for (const entry of entries) {
    const match = /^menu\.itemname\.(.+)$/.exec(entry.normalized);
    if (!match) continue;
    const full = match[1], split = full.lastIndexOf('.');
    const parent = split < 0 ? '' : full.slice(0, split);
    const name = full.slice(split + 1), text = def.unquote(entry.value);
    labels.set(full, text);
    if (!groups.has(parent)) groups.set(parent, []);
    const siblings = groups.get(parent), old = siblings.findIndex(item => item.name === name);
    const item = {name, text, line:entry.line};
    if (old >= 0) siblings[old] = item;
    else siblings.push(item);
  }
  const visible = path => {
    while (path) {
      if (labels.get(path) === '') return false;
      path = path.includes('.') ? path.slice(0,path.lastIndexOf('.')) : '';
    }
    return true;
  };
  return Array.from(groups, ([path,items]) => ({
    path, label:path ? path.split('.').map((key,i,parts) => labels.get(parts.slice(0,i+1).join('.')) || key).join(' › ') : 'Main menu',
    items:items.filter(item=>item.text)
  })).filter(group=>group.items.length && visible(group.path));
}

function editPage(text, section, fields) {
  const found = def.sections(def.parseDef(text),section);
  if (found.length > 1) throw new Error('Multiple [' + section + '] sections exist. Resolve the duplicate before editing this page.');
  if (!found.length) return appendSection(text,section,fields);
  for (const [key,value] of Object.entries(fields)) {
    const doc = def.parseDef(text);
    text = def.setSectionEntry(doc,def.sections(doc,section)[0].line,key,value);
  }
  return text;
}

async function choosePage(vscode,text,baseText='') {
  const document = def.parseDef(text);
  const exists = section => def.sections(document, section).length > 0;
  const hud = def.kind(document) === 'lifebar';
  const choices = (hud ? hudPages : pages).map(([label,section,fields]) => ({label,description:(exists(section)?'Edit':'Add')+' ['+section+']',section,fields}));
  if (!hud) choices.push({label:'Title menu item…',description:'Link Arcade, Versus, Training, Options or another mode',action:'mode'},
    {label:'Title submenu…',description:'Create a named page of mode choices with a Back item',action:'submenu'});
  if (!hud) {
    for (const [label,section] of pages.filter(p=>['Title Info','Option Info','Pause Menu'].includes(p[1]))) {
      const entries=def.sections(document,section)[0]?.entries||[];
      const defaults=def.sections(def.parseDef(baseText),section)[0]?.entries||[];
      if ([...entries,...defaults].some(e=>e.normalized.startsWith('menu.itemname.')))
        choices.push({label:'Edit '+label.toLowerCase()+' labels…',description:'Rename, hide or restore menu entries',section,action:'label'});
    }
  }
  const choice = await vscode.window.showQuickPick(choices,{title:hud?'Match HUD components':'Screenpack pages',placeHolder:'Choose a section to edit or add'});
  if (!choice) return;
  if (!choice.action) return {section:choice.section,text:editPage(text,choice.section,exists(choice.section)?{}:choice.fields)};
  const section = choice.section || 'Title Info', current = def.sections(document,section)[0];
  const fields = current ? {} : {...pages.find(page=>page[1]===section)[2]};
  // Adding the first authored menu item establishes a local menu ordering.
  // Retain the user's inherited menu choices when making that transition.
  if (!current?.entries.some(e=>e.normalized.startsWith('menu.itemname.'))) {
    const defaults=def.sections(def.parseDef(baseText),section)[0];
    for(const entry of defaults?.entries||[]) {
      if(entry.normalized.startsWith('menu.itemname.') && entry.value) fields[entry.key]=entry.value;
    }
  }
  if (choice.action==='label') {
    const names=new Map();
    for(const [key,value] of Object.entries(fields)) {
      if(key.startsWith('menu.itemname.')) names.set(key,def.unquote(value));
    }
    for(const e of current?.entries||[]) {
      if(e.normalized.startsWith('menu.itemname.')) names.set(e.normalized,def.unquote(e.value));
    }
    const selected=await vscode.window.showQuickPick([...names].map(([key,value])=>({
      key,value,label:value||'(hidden)',description:key.slice('menu.itemname.'.length)
    })),{title:'Menu labels · ['+section+']',matchOnDescription:true});
    if(!selected)return;
    const label=await vscode.window.showInputBox({title:selected.description,value:selected.value,
      prompt:'Display label. Leave empty to hide this entry.',validateInput:value=>value.trim()?labelError(value):undefined});
    if(label===undefined)return;
    const menuId=selected.description;
    fields[selected.key]=label.trim();
    return {section,menuPath:menuId.includes('.')?menuId.slice(0,menuId.lastIndexOf('.')):'',text:editPage(text,section,fields)};
  }
  const items = Object.entries(modes).map(([id,label])=>({id,label}));
  if (choice.action === 'mode') {
    const mode = await vscode.window.showQuickPick(items,{title:'Add or rename a title menu item'});
    if (!mode) return;
    const key = 'menu.itemname.' + mode.id;
    const label = await vscode.window.showInputBox({title:'Label for '+mode.label,value:def.unquote(def.value(current,key,''))||mode.label,validateInput:labelError});
    if (!label) return;
    fields[key] = label.trim();
    return {section,text:editPage(text,section,fields)};
  }
  const keyFor = value => 'menu'+value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
  const label = await vscode.window.showInputBox({title:'New title submenu',placeHolder:'For example: Arcade Modes',validateInput:value=>{
    const error = labelError(value);
    if (error) return error;
    if (keyFor(value)==='menu') return 'Include a letter A–Z or a number in the name.';
    if ([...Object.keys(fields),...(current?.entries||[]).map(e=>e.normalized)].some(key=>key==='menu.itemname.'+keyFor(value)||key.startsWith('menu.itemname.'+keyFor(value)+'.'))) return 'This submenu already exists.';
  }});
  if (!label) return;
  const selected = await vscode.window.showQuickPick(items,{title:'Modes on '+label,canPickMany:true,placeHolder:'Choose the items for this submenu. Back is added automatically.'});
  if (!selected?.length) return;
  const menuPath=keyFor(label), prefix='menu.itemname.'+menuPath;
  fields[prefix]=label.trim();
  for (const item of selected) fields[prefix+'.'+item.id]=item.label;
  fields[prefix+'.back']='Back';
  return {section,menuPath,text:editPage(text,section,fields)};
}

function labelError(value) {
  if (!value.trim() || /[;\r\n"\[\]]/.test(value)) return 'Enter a single-line label without quotes, semicolons or brackets.';
}
// Pull display defaults from the engine associated with this motif. These
// values exist only in the preview and do not acquire editable source lines.
function applyMenuDefaults(model, baseText) {
  const base = def.parseDef(baseText);
  for (const screen of model.screens) {
    const defaults = def.sections(base,screen.normalized)[0];
    if (!defaults) continue;
    const authored = model.source.sections.find(s=>s.line===screen.line);
    const explicit = new Set(authored.entries.map(e=>e.normalized));
    const hasLocalMenu=authored.entries.some(e=>e.normalized.startsWith('menu.itemname.'));
    const entries=hasLocalMenu ? authored.entries : defaults.entries;
    screen.menuGroups = menuGroups(entries);
    screen.menuItems = screen.menuGroups.find(group=>!group.path)?.items || [];
    for (const element of screen.elements) {
      const key=element.base ? element.base+'.text' : 'text';
      if (!explicit.has(key)) {
        const value=def.entry(defaults,key);
        if(value) { element.properties.text=value.value; element.text=def.unquote(value.value); }
      }
    }
  }
}
module.exports = {menuGroups,choosePage,editPage,applyMenuDefaults};
