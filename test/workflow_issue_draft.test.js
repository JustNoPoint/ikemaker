const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../src/production_workflow_workspace.js'),'utf8');
const script=source.slice(source.indexOf('function issueDraftIdentity()'),source.indexOf('function step(s)'));
let stored={},messages=[],form;
function makeForm(){const fields={title:{value:''},body:{value:''},steps:{value:''}};return {fields,elements:{namedItem:name=>fields[name]}};}
const sandbox={data:{character:{defPath:'C:/Game/chars/A/a.def'},issueDraft:null},view:'tickets',$:()=>form,FormData:function(form){return Object.entries(form.fields).map(([name,field])=>[name,field.value]);},vscode:{getState:()=>stored,setState:value=>stored=value,postMessage:message=>messages.push(message)}};
vm.createContext(sandbox);vm.runInContext(script,sandbox);form=makeForm();sandbox.restoreIssueDraft();form.fields.title.value='Issue title';form.fields.steps.value='Step one\nStep two';form.oninput();
form=makeForm();sandbox.view='reports';sandbox.restoreIssueDraft();assert.equal(form.fields.title.value,'Issue title');assert.equal(form.fields.steps.value,'Step one\nStep two');
sandbox.data.issueDraft={title:'stale host response'};form=makeForm();sandbox.restoreIssueDraft();assert.equal(form.fields.title.value,'Issue title','A stale refresh must not erase newer typed data');
sandbox.data.character.defPath='C:/Game/chars/B/b.def';sandbox.data.issueDraft=null;form=makeForm();sandbox.restoreIssueDraft();assert.equal(form.fields.title.value,'','Drafts must not leak between characters');
sandbox.data.character.defPath='C:/Game/chars/A/a.def';form=makeForm();sandbox.restoreIssueDraft();assert.equal(form.fields.title.value,'Issue title');form.onreset();form=makeForm();sandbox.restoreIssueDraft();assert.equal(form.fields.title.value,'','Clear form must clear the retained draft');
assert(messages.some(m=>m.type==='issueDraft'&&m.values?.steps==='Step one\nStep two'));assert.equal(messages.at(-1).values,null);
console.log('Issue draft survives rerender, stale refresh and character switching; explicit reset clears it');

const filter=source.split('\n').find(line=>line.startsWith('function inIssueProject('));const filterEnv={issueProjectFilter:'id:stable-project'};vm.createContext(filterEnv);vm.runInContext(filter,filterEnv);assert(filterEnv.inIssueProject({workProjectId:'stable-project',project:'Renamed project'}));assert(!filterEnv.inIssueProject({workProjectId:'different'}));filterEnv.issueProjectFilter='unassigned';assert(filterEnv.inIssueProject({project:'Legacy name'}));assert(!filterEnv.inIssueProject({workProjectId:'stable-project'}));

const projectFunction=source.split('\n').find(line=>line.startsWith('function issueProject('));vm.runInContext(projectFunction,filterEnv);const identity=filterEnv.issueProject({assignedWorkProject:{id:'current'},ticketBoard:{tickets:[{id:'parent',workProjectId:'other',gameProjectId:'game',project:'Other project'}]}},'parent');assert.equal(identity.workProjectId,'other','A child ticket inherits its parent project, not the currently open character');
