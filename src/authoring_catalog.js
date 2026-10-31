'use strict';

const zssStructures = require('./zss_structures');
const sf6ReferenceRecipes = require('./sf6_reference_recipes');
const { entryAvailable } = require('./catalog_capability_filter');

const STANDARD_RECIPES = [
  {
    id: 'standard.recipe.normal.basic', kind: 'recipe', source: 'IKEMEN Standard', family: 'Normals',
    label: 'Basic Normal Move', detail: 'A modular StateDef scaffold with startup, active, recovery, and cleanup sections.',
    compatibility: 'universal', beginnerSafe: true,
    sections: [
      { id: 'state', label: 'State entry', detail: 'Declares the authored attack state.', snippet: '# ${2:Normal name}\n[StateDef ${1:200}; type: S; moveType: A; physics: S]\n\n${0}' },
      { id: 'attack', label: 'Attack definition', detail: 'Adds a HitDef starting point to an existing attack state.', snippet: 'if time = ${1:startupFrame} {\n\thitDef {\n\t\tattr: S, NA;\n\t\tdamage: ${2:30}, ${3:0};\n\t}\n}\n${0}' },
      { id: 'return', label: 'Recovery and return', detail: 'Returns control when the animation finishes.', snippet: 'if !animTime {\n\tchangeState { value: ${1:0}; ctrl: 1 }\n}\n${0}' }
    ]
  },
  {
    id: 'standard.recipe.special.basic', kind: 'recipe', source: 'IKEMEN Standard', family: 'Specials',
    label: 'Basic Special Move', detail: 'A project-neutral special move skeleton with explicit recovery.',
    compatibility: 'universal', beginnerSafe: true,
    sections: [
      { id: 'state', label: 'State entry', detail: 'Declares the special state.', snippet: '# ${2:Special name}\n[StateDef ${1:1000}; type: S; moveType: A; physics: S; ctrl: 0]\n\n${0}' },
      { id: 'return', label: 'Recovery and return', detail: 'Returns to standing when the animation completes.', snippet: 'if !animTime {\n\tchangeState { value: ${1:0}; ctrl: 1 }\n}\n${0}' }
    ]
  },
  {
    id: 'standard.recipe.projectile.helper', kind: 'recipe', source: 'IKEMEN Standard', family: 'Projectiles / Helpers',
    label: 'Helper Projectile Skeleton', detail: 'A guarded helper/projectile starting point with visible cleanup guidance and no project-specific maps.',
    compatibility: 'universal', beginnerSafe: false,
    sections: [
      { id: 'spawn', label: 'Spawn helper', detail: 'Creates a helper with an authored ID and state.', snippet: 'helper {\n\tname: "${1:Projectile}";\n\tid: ${2:1000};\n\tstateNo: ${3:1001};\n\tpos: ${4:0}, ${5:0};\n\tposType: P1;\n}\n${0}' },
      { id: 'guard', label: 'Safe helper access', detail: 'Checks helper existence before redirecting.', structureId: 'helperGuard' }
    ]
  },
  {
    id: 'standard.recipe.cleanup.maps', kind: 'recipe', source: 'IKEMEN Standard', family: 'Shared Utilities',
    label: 'Reset Authored Maps', detail: 'A visible cleanup section for maps owned by the move.',
    compatibility: 'universal', beginnerSafe: true,
    sections: [{ id: 'reset', label: 'Map cleanup', detail: 'Reset one authored map.', snippet: 'map(${1:MapName}) := 0;${0}' }]
  }
];

const NIGHTLY_STRING_RECIPES = [
  {
    id:'nightly.recipe.string-map',kind:'recipe',source:'IKEMEN GO Nightly',family:'Nightly Strings',nightlyString:true,
    label:'Typed String Map',detail:'Store and read a string-valued map while keeping string MapAdd unavailable.',compatibility:'nightly-string-runtime',beginnerSafe:false,
    sections:[
      {id:'set',label:'Set string map value',detail:'Assign a quoted string to an auto-typed map.',snippet:'map(${1:MoveName}) := "${2:sLP}";${0}',nightlyString:true},
      {id:'read',label:'Read string map value',detail:'Use the typed map value in a string-capable expression.',snippet:'map(${1:MoveName})${0}',nightlyString:true}
    ]
  },
  {
    id:'nightly.recipe.string-function',kind:'recipe',source:'IKEMEN GO Nightly',family:'Nightly Strings',nightlyString:true,
    label:'String Function Flow',detail:'Pass a string through a ZSS local variable and authored function argument.',compatibility:'nightly-string-runtime',beginnerSafe:false,
    sections:[{id:'call',label:'Call function with string',detail:'Create a local string and pass it to an authored function.',snippet:'let ${1:moveName} = "${2:sLP}";\n${3:LogMove}(\$${1:moveName});${0}',nightlyString:true}]
  },
  {
    id:'nightly.recipe.string-log',kind:'recipe',source:'IKEMEN GO Nightly',family:'Nightly Strings',nightlyString:true,
    label:'Log a Runtime String',detail:'Send a string expression to IKEMEN\'s runtime console without converting it to a numeric placeholder.',compatibility:'nightly-string-runtime',beginnerSafe:false,
    sections:[{id:'console',label:'Print string to console',detail:'Print a typed string expression through the console logger.',snippet:'printToConsole {\n\ttext: "%v";\n\tparams: ${1:map(MoveName)};\n}\n${0}',nightlyString:true}]
  },
  {
    id:'nightly.recipe.dynamic-command',kind:'recipe',source:'IKEMEN GO Nightly',family:'Commands / Input',nightlyString:true,capabilityId:'command.nightly-expressions',
    label:'Dynamic Command Name',detail:'Select a Command or SelfCommand name from a scoped string local without guessing its runtime value.',compatibility:'nightly-command-expressions',beginnerSafe:false,
    sections:[
      {id:'command-local',label:'Command from scoped local',detail:'Create a local command-name string and compare Command against it.',snippet:'let ${1:commandName} := "${2:holdfwd}";\nif command = \$${1:commandName} {\n\t${0}\n}',nightlyString:true},
      {id:'self-command-local',label:'SelfCommand from scoped local',detail:'Resolve the same reviewed local against the state owner command list.',snippet:'let ${1:commandName} := "${2:holdfwd}";\nif SelfCommand = \$${1:commandName} {\n\t${0}\n}',nightlyString:true}
    ]
  }
];

const EXAMPLE_PACKS = [
  { id: 'example.sf6', kind: 'examplePack', source: 'Bundled Example', label: 'SF6 Template — by JustNoPoint', detail: 'Normals-to-hypers architecture, hit metadata, reactions, cancels, training, and authored corner push.', compatibility: 'reference', status: 'Reference foundation; deep recipe extraction pending.' },
  { id: 'example.ds', kind: 'examplePack', source: 'Bundled Example', label: 'Darkstalkers Template', detail: 'Bundled offline learning reference for Darkstalkers-style character systems.', compatibility: 'reference', status: 'Attribution, license, and capability manifest verification pending.' },
  { id: 'example.ds4', kind: 'examplePack', source: 'Bundled Example', label: 'Darkstalkers 4 Template', detail: 'Bundled offline learning reference for the DS4 template architecture.', compatibility: 'reference', status: 'Attribution, license, and capability manifest verification pending.' },
  { id: 'example.hdbz', kind: 'examplePack', source: 'Bundled Example', label: 'Hyper Dragon Ball Z — Project Reference Pack', detail: 'Bundled offline learning reference for HDBZ project conventions and systems.', compatibility: 'reference', status: 'Project-preferred naming, attribution, and manifest verification pending.' }
];

function structureItems() {
  return zssStructures.STRUCTURES.map((item) => ({
    id: `standard.structure.${item.id}`, kind: 'structure', source: 'IKEMEN Standard',
    label: item.label, detail: item.detail, compatibility: 'universal', structureId: item.id,
    family: zssStructures.GROUPS.find((group) => group.id === item.group)?.label || 'Structures'
  }));
}

function allRecipes() { return [...STANDARD_RECIPES, ...NIGHTLY_STRING_RECIPES, ...sf6ReferenceRecipes.RECIPES]; }
function recipes(options={}) { return allRecipes().filter(item=>(!item.nightlyString||options.nightlyStringsEnabled===true)&&entryAvailable(item,options.capabilities)); }
function sectionItems() {
  return allRecipes().flatMap((recipe) => recipe.sections.map((section) => ({
    id: `${recipe.id}.section.${section.id}`, kind: 'recipeSection', source: recipe.source,
    label: section.label, detail: `${recipe.label}: ${section.detail}`, compatibility: recipe.compatibility,
    family: recipe.family, parentId: recipe.id, sectionId: section.id, snippet: section.snippet, structureId: section.structureId,
    referenceOnly: Boolean(section.referenceOnly), sourceFileHint: section.sourceFileHint, symbol: section.symbol,
    allowedFileTypes: section.allowedFileTypes || [], ownership: section.ownership || '', nightlyString:Boolean(section.nightlyString || recipe.nightlyString), capabilityId:section.capabilityId||recipe.capabilityId||''
  })));
}

function allItems() { return [...structureItems(), ...allRecipes(), ...sectionItems(), ...EXAMPLE_PACKS]; }
function itemById(id) { return allItems().find((item) => item.id === id); }
function search(query, filters = {}) {
  const hasQuery = Boolean(String(query || '').trim());
  return allItems().filter((item) => {
    if (filters.kind && item.kind !== filters.kind) return false;
    if (filters.source && item.source !== filters.source) return false;
    const haystack = `${item.label} ${item.detail} ${item.family || ''} ${item.source} ${item.id}`.toLowerCase();
    return !hasQuery || require('./intent_search').matches(haystack, query, filters.intentAliases);
  });
}

module.exports = { STANDARD_RECIPES, NIGHTLY_STRING_RECIPES, PROJECT_RECIPES: sf6ReferenceRecipes.RECIPES, EXAMPLE_PACKS, recipes, allItems, itemById, search };
