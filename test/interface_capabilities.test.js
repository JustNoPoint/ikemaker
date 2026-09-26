const assert=require('assert'),policy=require('../src/interface_capabilities'),pkg=require('../package.json');
assert(policy.allows('ikemen.docs.openOffline','player'));assert(policy.allows('ikemen.storyDialogue.openPlayer','player'));assert(!policy.allows('ikemen.character.createNew','player'));assert(policy.allows('ikemen.character.createNew','simple'));assert(!policy.allows('ikemen.moveLab.open','simple'));assert(policy.allows('ikemen.moveLab.open','workspace'));
for(const {command}of pkg.contributes.commands){const gate=policy.condition(command);if(gate)assert(pkg.contributes.menus.commandPalette.some(item=>item.command===command&&item.when.includes(gate)),command+' missing mode visibility');}
assert(policy.commandStyle('player').includes('[data-run-command="sff.openViewer"]'));assert(policy.commandStyle('player').includes('display:none!important'));assert.equal(policy.commandStyle('workspace'),'');
assert(pkg.contributes.views.ikemen.find(view=>view.id==='zssNavigator').when.includes('== workspace'));
console.log('Nested mode capabilities agree with command palette and sidebar visibility; dynamic command controls use persistent CSS');
