'use strict';
const assert = require('assert');
const { definitionContext, reportContext, ITEM_TYPES } = require('../src/feedback_context');
const tickets = require('../src/team_ticket_model');
assert.deepStrictEqual(definitionContext('[Info]\nname="Example"\nversion=2.4\n[StageInfo]\n'), { itemType:'Stage',itemName:'Example',contentVersion:'2.4' });
assert.strictEqual(definitionContext('[Info]\nname=Fighter\nmugenversion=1.0\n[Files]\nsprite=a.sff').contentVersion, 'Unknown', 'Engine compatibility version is not content version');
assert.strictEqual(definitionContext('[Info]\nversiondate=09,13,2026').contentVersion, 'Version date: 09,13,2026');
assert.strictEqual(definitionContext('[Info]\nname=Intro\nversion=3\n[SceneDef]\n', '', 'Opening').itemType, 'Opening');
assert.strictEqual(definitionContext('[Info]\nname=Menu\n[Title Info]\n').itemType, 'Screenpack/Motif');
const defaults = reportContext({character:{name:'Ryu',contentVersion:'1.2'},profile:{name:'SF6'}},'0.75.test');
assert.strictEqual(defaults.toolVersion,'0.75.test');assert.strictEqual(defaults.screen,'Production Workflow');assert.strictEqual(defaults.contentVersion,'1.2');
for (const itemType of ITEM_TYPES) {
  const context={...defaults,itemType,itemName:'Named item',contentVersion:'Unknown',useCase:'Compare two versions',profile:'Chosen profile',screen:'SFF Palettes'};
  let board=tickets.submitReport({project:'Project A'}, {...context,title:'Feedback',body:'What happened',expected:'Preferred behavior',steps:'Open item',attachments:['mockup.png']});
  board=tickets.normalizeBoard(JSON.parse(JSON.stringify(board)));
  board=tickets.reviewReport(board,board.reports[0].id,'accepted',{type:'Feature'},'Reviewer');
  board=tickets.normalizeBoard(JSON.parse(JSON.stringify(board)));
  for(const key of Object.keys(context))assert.strictEqual(board.tickets[0][key],context[key],`${itemType}: ${key} survives intake, acceptance and reload`);
  assert.strictEqual(board.tickets[0].project,'Project A');assert.deepStrictEqual(board.tickets[0].attachments,['mockup.png']);
}
console.log('Feedback context and report conversion tests passed');
