'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..'),read=filename=>fs.readFileSync(path.join(root,filename),'utf8'),pkg=JSON.parse(read('package.json'));

const insights=read('src/coding_assistance_insights.js'),extension=read('src/extension.js'),browser=read('src/authoring_browser_workspace.js'),host=read('src/coding_assistance_action_host.js'),authoringHost=read('src/authoring_workspace.js'),spatial=read('src/spatial_composer_workspace.js'),scale=read('src/character_scale_review_service.js'),language=read('src/language_providers.js'),moveLab=read('src/move_lab_workspace.js'),matrix=read('.analysis/coding-assistance-reachability-matrix.md');
const groups=['condition-inspector','value-origin','change-impact','event-timeline','coordinate-attachment','local-map','worked-example','semantic-change','scenarios','resource-lifetime'];
for(const id of groups)assert(insights.includes(`group('${id}'`),`${id} must be projected into the authoritative Project Data provider`);

for(const id of ['code-navigator','project-data','recipes','similar-code','controllers','problems'])assert(browser.includes(`'${id}'`)||browser.includes(`${id}:`),`${id} must have a Coding Assistance browser surface`);
for(const provider of ["'code-navigator'","'project-data'",'recipes','controllers'])assert(extension.includes(provider),`${provider} provider must be registered by extension activation`);
assert.match(browser,/create-adaptation-draft/);assert.match(browser,/Create Scratch Draft/);assert.match(language,/projectDataHover/);assert.match(moveLab,/Connected event timeline/);assert.match(moveLab,/data-event-track/);assert.match(moveLab,/kind:'timeline'/);
for(const id of ['focus-similar-code','open-example-templates','open-recipe-library','open-native-diff','open-coordinate-tools']){assert(insights.includes(id),`${id} must originate from a projected Coding Insight row`);assert(browser.includes(`'${id}'`),`${id} must be in the browser's closed host-action vocabulary`);assert(host.includes(`'${id}'`),`${id} must have a tested host executor`);}
assert.match(authoringHost,/handleAssistantAction/);assert.match(authoringHost,/codingAssistantActions\.execute/);assert.match(host,/vscode\.diff/);assert.match(host,/ikemen\.positionCamera\.open/);assert.match(host,/ikemen\.scaleReview\.run/);assert.match(spatial,/reviewedSourceSelection/);assert.match(scale,/preferredSourcePath/);

const projectMenu=pkg.contributes.menus['ikemen.text.project']||[],newCommands=['ikemen.authoring.saveScenario','ikemen.authoring.launchScenario','ikemen.authoring.recordScenarioResult','ikemen.authoring.setConditionValues'];
for(const command of newCommands){assert(pkg.activationEvents.includes(`onCommand:${command}`),`${command} must activate the extension`);assert(pkg.contributes.commands.some(item=>item.command===command),`${command} must have a visible label`);const route=projectMenu.find(item=>item.command===command);assert(route&&/activeTextKind/.test(route.when||''),`${command} must be context-gated in the native Project menu`);}
for(const menu of ['editor/title','view/title'])for(const item of pkg.contributes.menus[menu]||[])assert(!newCommands.includes(item.command),`${item.command} must not add a redundant title/header action`);

for(const heading of ['Backend-only','Registered-unreachable','Physical-pending','Concise installed manual checks'])assert(matrix.includes(heading),`audit matrix must explicitly classify ${heading}`);
for(const label of ['Condition Inspector','Value Origin Inspector','Change Impact Review','Connected Event Timeline','Coordinate / Attachment Inspector','Local State / Function Map','Worked Example Adaptation','Semantic Change Summary','Saved Scenario Checks','Resource Lifetime View'])assert(matrix.includes(label),`audit matrix must include ${label}`);
assert.match(matrix,/bounded table after row-by-row route review/i);assert.match(matrix,/not a repository-wide absence claim/i);

console.log('Coding-assistance registration, provider, context-menu, non-duplicate-header, and matrix reachability audit passed');
