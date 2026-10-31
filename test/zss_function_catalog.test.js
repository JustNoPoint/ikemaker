'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildZssFunctionCatalog, catalogStillCurrent, functionCallFindings, functionOwnerCacheStats, invalidateFunctionOwnerCache, resetFunctionOwnerCacheForTests } = require('../src/zss_function_catalog');
const { functionDefinitions, functionCallAtPosition, functionCallAtDocumentPosition, definitionsFor, referencesFor } = require('../src/zss_navigation');
const { analyzeZss, collectRecords } = require('../src/analyzer');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ikemaker-function-catalog-'));
const ryu = path.join(root, 'Ryu'), ken = path.join(root, 'Ken'); fs.mkdirSync(ryu); fs.mkdirSync(ken);
const def = path.join(ryu, 'Ryu.def'), one = path.join(ryu, 'one.zss'), shared = path.join(ryu, 'shared.zss'), unrelated = path.join(ken, 'states.zss');
fs.writeFileSync(def, '[Map]\nSession.Mode = "training"\n[Constants]\nProject.Label = "Ryu"\n[Files]\nst = one.zss\nst1 = shared.zss\n');
fs.writeFileSync(one, '[Function Owned(first, second)]\ncall Shared($first);\n');
fs.writeFileSync(shared, '[Function Shared(value)]\nreturn $value;\n');
fs.writeFileSync(unrelated, '[Function Owned(wrong)]\nreturn $wrong;\n');
const uri = filename => ({ fsPath: filename, scheme: 'file', toString: () => filename });
const documents = new Map();
const vscode = { Uri: { file: uri }, workspace: { textDocuments: [], openTextDocument: async value => documents.get(path.resolve(value.fsPath).toLowerCase()) || ({ fileName: value.fsPath, uri: value, version: 1, isDirty: false, getText: () => fs.readFileSync(value.fsPath, 'utf8') }) } };
const scope = { def, characterName: 'Ryu', missingDependencies: [], unsupportedDependencies: [], scopeFiles: { assigned: [one, shared] } };
const service = { scope: () => scope };

(async () => {
  let catalog = await buildZssFunctionCatalog(vscode, uri(one), service);
  assert.strictEqual(catalog.complete, true);
  assert.deepStrictEqual(functionDefinitions(catalog.entries).map(item => item.name), ['Owned', 'Shared'], 'owner catalog includes assigned/shared files and excludes an unrelated character with the same function name');
  assert.strictEqual(definitionsFor(catalog.entries,{kind:'map',name:'Session.Mode'}).length,1,'the owning character DEF map default is a first-class definition in the connected code catalog');
  assert.strictEqual(definitionsFor(catalog.entries,{kind:'constant',name:'Project.Label'}).length,1,'the owning character DEF constant is a first-class definition in the connected code catalog');
  let findings = functionCallFindings(catalog, collectRecords('call Owned(foo(1, 2), "a,b");\ncall Missing();'), { ownedPrefixes: ['miss'] });
  assert.deepStrictEqual(findings.map(item => [item.code, item.record.arity]), [['missing-function', 0]], 'nested and quoted commas receive the correct arity while a truly missing literal function is reported');
  assert.deepStrictEqual(functionCallFindings(catalog, collectRecords('call EngineOrCustomGlobal();')), [], 'unknown non-owned functions remain silent because the assigned character catalog cannot prove the engine or custom runtime contract');
  assert.deepStrictEqual(functionCallFindings(catalog, collectRecords('call MISSING();'), { ownedPrefixes: ['Miss'] }).map(item => item.severity), ['error'], 'owned-prefix matching is case-insensitive and missing owned functions remain critical');
  findings = functionCallFindings(catalog, collectRecords('call Owned(1);'));
  assert.deepStrictEqual(findings.map(item => item.code), ['function-arity'], 'a uniquely resolved authored signature reports a real argument mismatch');
  const functionEntry=catalog.entries.find(entry=>entry.records.functions.length);
  const grammar=collectRecords('[Function Typed(\n label,\n amount\n) result, status]\nlet result = "ready";');
  assert.deepStrictEqual(grammar.functions.map(record=>({name:record.name,params:record.params,returns:record.returns,signature:record.signature})),[{name:'Typed',params:['label','amount'],returns:['result','status'],signature:'(label, amount) result, status'}],'multiline headers retain untyped argument and return variable names');
  assert.deepStrictEqual(analyzeZss('[Function Invalid(label = "ready", amount: int)]').issues.filter(item=>item.code==='invalid-function-header').map(item=>item.severity),['error','error'],'defaults and type annotations are diagnosed rather than modeled as contracts');
  assert.deepStrictEqual(analyzeZss('[Function Duplicate()]\n[Function Duplicate(value)]').issues.filter(item=>item.code==='duplicate-function-declaration').map(item=>item.line),[1],'same-source duplicate declarations are diagnosed even before a call site exists');
  assert.deepStrictEqual(collectRecords('[Function DisplayName(value) string]').functions[0].returns,['string'],'a trailing string token is a return variable name, not a return type');
  const commentedHeader=collectRecords('[Function Escaped(\r\n first, # keep offsets\r\n second\r\n) result]');assert.deepStrictEqual(commentedHeader.functions[0].params,['first','second'],'comments and CRLF inside a multiline header do not corrupt parameter parsing');
  assert.deepStrictEqual(analyzeZss('[Function Trailing(value,) result]').issues.filter(item=>item.code==='invalid-function-header').map(item=>item.severity),['error'],'a trailing comma is diagnosed as an empty parameter instead of silently changing arity');
  assert.deepStrictEqual(analyzeZss('[Function Broken(value)').issues.filter(item=>item.code==='invalid-function-header').map(item=>item.severity),['error'],'an incomplete header receives one bounded syntax diagnostic');
  assert.deepStrictEqual(functionCallFindings(catalog,collectRecords('call Owned("many", 2);'),{capabilities:{enabledCapabilities:['zss.runtime-strings']}}),[],'dynamic ZSS parameters accept mixed runtime value kinds without a false type-contract diagnostic');
  const duplicateCatalog = { ...catalog, entries: [...catalog.entries, { ...functionEntry }] };
  assert.deepStrictEqual(functionCallFindings(duplicateCatalog, collectRecords('call Owned(1, 2);')).map(item => item.code), ['duplicate-function'], 'same-source duplicate declarations are hard errors even when their arity agrees');
  const crossFileDuplicate={...catalog,entries:[...catalog.entries,{...functionEntry,filename:path.join(ryu,'other.zss'),uri:uri(path.join(ryu,'other.zss'))}]};const crossFileFinding=functionCallFindings(crossFileDuplicate,collectRecords('call Owned(1, 2);'))[0];assert.strictEqual(crossFileFinding.code,'ambiguous-function');assert.match(crossFileFinding.message,/first compiled declaration.*not proven/i,'cross-file shadowing explains first-wins semantics without guessing compile order');

  const live = (filename, languageId) => { let text = fs.readFileSync(filename, 'utf8'), version = 1; return { fileName: filename, uri: uri(filename), languageId, isDirty: false, get version() { return version; }, getText: () => text, edit(value) { text = value; version += 1; } }; };
  const liveDef = live(def, 'ikemen-def'), liveOne = live(one, 'zss'), liveShared = live(shared, 'zss');
  vscode.workspace.textDocuments = [liveDef, liveOne, liveShared];
  catalog = await buildZssFunctionCatalog(vscode, uri(one), service);
  assert.strictEqual(await catalogStillCurrent(vscode, catalog, service), true, 'the complete owner and assigned-source snapshot validates while every authority input is unchanged');
  liveShared.edit('[Function Changed(value)]\nreturn $value;');
  assert.strictEqual(await catalogStillCurrent(vscode, catalog, service), false, 'an assigned declaration change invalidates the whole catalog before publication');
  vscode.workspace.textDocuments = [];
  assert.strictEqual((await buildZssFunctionCatalog(vscode, uri(one), service, { files: 1 })).complete, false, 'hitting the assigned-file bound makes the catalog incomplete instead of silently indexing a partial graph');
  vscode.workspace.textDocuments = [{ fileName: shared, uri: uri(shared), version: 2, isDirty: true, getText: () => '[Function Unsaved(value, extra)]\nreturn $value;' }];
  catalog = await buildZssFunctionCatalog(vscode, uri(one), service);
  assert.deepStrictEqual(functionDefinitions(catalog.entries).map(item => [item.name, item.params]), [['Owned', ['first', 'second']], ['Unsaved', ['value', 'extra']]], 'unsaved assigned ZSS text is authoritative for live assistance');
  vscode.workspace.textDocuments.push({ fileName: def, uri: uri(def), version: 2, isDirty: true, getText: () => fs.readFileSync(def, 'utf8') + 'st2 = other.zss\n' });
  catalog = await buildZssFunctionCatalog(vscode, uri(one), service);
  assert.strictEqual(catalog.complete, false, 'a dirty owner DEF makes the catalog incomplete rather than guessing assignments');
  assert.deepStrictEqual(functionCallFindings(catalog, collectRecords('call Missing();')), [], 'incomplete catalogs suppress missing-function claims');
  scope.missingDependencies = [path.join(ryu, 'missing.zss')]; vscode.workspace.textDocuments = [];
  catalog = await buildZssFunctionCatalog(vscode, uri(one), service);
  assert.strictEqual(catalog.complete, false, 'missing assigned code makes assistance fail closed');
  assert.deepStrictEqual(functionCallAtPosition('call Owned(foo(1, 2), "a,b", value); # call Wrong()', 32), { name: 'Owned', prefix: 'Owned', start: 5, end: 10, hasArguments: true, open: 10, close: 34, activeParameter: 2 }, 'call context counts only top-level arguments and ignores quoted commas');
  assert.strictEqual(functionCallAtPosition('call First(); call Second(value);', 26).name, 'Second', 'a completed earlier call never captures hover or signature help intended for a later call on the same line');
  assert.strictEqual(functionCallAtPosition('let text = "call Wrong()"; # call AlsoWrong()', 20), null, 'quoted and commented call-looking text is ignored');
  const multilineCall='call Owned(\n  foo(1, 2),\n  "a,b",\n  value\n);';
  const multilineContext=functionCallAtDocumentPosition(multilineCall,3,4);assert.strictEqual(multilineContext.name,'Owned');assert.strictEqual(multilineContext.activeParameter,2,'multiline call context counts only top-level arguments');assert.strictEqual(multilineContext.line,0);assert.strictEqual(multilineContext.start,5);
  const commentedCall='call Owned(\r\n  "escaped \\\" comma, still first", # ignored, comma\r\n  value\r\n';const commentedContext=functionCallAtDocumentPosition(commentedCall,2,4);assert.strictEqual(commentedContext.activeParameter,1,'escaped quotes, comments, CRLF, and an incomplete call retain the correct active argument');assert.strictEqual(commentedContext.close,-1,'incomplete calls remain assistance contexts without inventing a closing delimiter');

  scope.missingDependencies = []; const custom = path.join(ryu, 'custom.txt'); scope.scopeFiles.assigned.push(custom);
  const customDocument = { fileName: custom, uri: uri(custom), languageId: 'zss', version: 1, isDirty: true, getText: () => '[Function CustomText(value)]\nreturn $value;' };
  vscode.workspace.textDocuments = [customDocument];
  catalog = await buildZssFunctionCatalog(vscode, uri(one), service);
  assert(functionDefinitions(catalog.entries).some(item => item.name === 'CustomText'), 'an explicitly classified assigned .txt ZSS document participates in the owner catalog');
  const outside = path.join(ryu, 'outside.txt'), outsideDocument = { fileName: outside, uri: uri(outside), languageId: 'zss', version: 1, isDirty: false, getText: () => 'call Owned(1, 2);' };
  vscode.workspace.textDocuments.push(outsideDocument);
  catalog = await buildZssFunctionCatalog(vscode, uri(outside), service);
  assert.strictEqual(catalog.complete, false, 'an open custom-extension ZSS source outside the DEF assignment fails closed');

  // Shared/external sources require a bounded reverse assignment proof. A
  // retained character scope is evidence, not authority, when another DEF can
  // assign the same file.
  const externalFolder = path.join(root, 'Shared'); fs.mkdirSync(externalFolder);
  const external = path.join(externalFolder, 'external.zss'); fs.writeFileSync(external, '[Function External(value)]\nreturn $value;');
  fs.writeFileSync(def, '[Files]\nsprite = Ryu.sff\nst = one.zss\nst1 = shared.zss\nst2 = ../Shared/external.zss\n');
  const kenDef = path.join(ken, 'Ken.def'); fs.writeFileSync(kenDef, '[Files]\nsprite = Ken.sff\nst = states.zss\n');
  scope.def = def; scope.scopeFiles.assigned = [one, shared, external];
  vscode.workspace.textDocuments = [];
  vscode.workspace.findFiles = async () => [uri(def)];
  catalog = await buildZssFunctionCatalog(vscode, uri(external), service);
  assert.strictEqual(catalog.complete, true, 'one bounded reverse assignment proves the owner of an external shared ZSS source');
  assert.strictEqual(path.resolve(catalog.owner), path.resolve(def));
  fs.writeFileSync(kenDef, '[Files]\nsprite = Ken.sff\nst = ../Shared/external.zss\n');
  invalidateFunctionOwnerCache();
  vscode.workspace.findFiles = async () => [uri(def), uri(kenDef)];
  catalog = await buildZssFunctionCatalog(vscode, uri(external), service);
  assert.strictEqual(catalog.complete, false, 'two reverse assignments remain ambiguous even when retained context points at one owner');
  assert.strictEqual(catalog.owner, '');
  const orphan = path.join(externalFolder, 'orphan.zss'); fs.writeFileSync(orphan, 'call JNP_Missing();');
  invalidateFunctionOwnerCache();
  vscode.workspace.findFiles = async () => [uri(def), uri(kenDef)];
  catalog = await buildZssFunctionCatalog(vscode, uri(orphan), service);
  assert.strictEqual(catalog.complete, false, 'an external source with no assigning DEF has no diagnostic authority');

  // Every assigned code input participates in the publication snapshot, even
  // when it is CNS rather than a function-bearing ZSS source.
  fs.writeFileSync(kenDef, '[Files]\nsprite = Ken.sff\nst = states.zss\n');
  const support = path.join(ryu, 'support.cns'); fs.writeFileSync(support, '[StateDef -2]\n[State -2, owned helper]\ntype = Helper\nid = 8800\nstateno = 8800\n');
  scope.scopeFiles.assigned = [one, shared, support]; vscode.workspace.findFiles = undefined;
  const liveSupport = live(support, 'ikemen-cns'); vscode.workspace.textDocuments = [liveDef, liveOne, liveShared, liveSupport];
  catalog = await buildZssFunctionCatalog(vscode, uri(one), service);
  assert(catalog.authority.dependencies.some(item => path.resolve(item.filename) === path.resolve(support)), 'non-ZSS assigned code is captured as authority input');
  const supportEntry=catalog.entries.find(item=>path.resolve(item.filename)===path.resolve(support));
  assert.strictEqual(supportEntry.grammar,'ikemen-cns','assigned CNS/ST retains its grammar in the exact-owner catalog');
  assert.deepStrictEqual(supportEntry.records.resources.filter(item=>item.role==='creation').map(item=>[item.kind,item.id]),[['helper','8800']],'literal resource creations in assigned CNS/ST are first-class exact-owner evidence');
  assert.strictEqual(await catalogStillCurrent(vscode, catalog, service), true);
  liveSupport.edit('[StateDef -2]\n; changed without changing assignments');
  assert.strictEqual(await catalogStillCurrent(vscode, catalog, service), false, 'same-path non-ZSS content changes invalidate function findings');

  const oversized = path.join(ryu, 'oversized.zss'); fs.writeFileSync(oversized, ' '.repeat(1100));
  scope.scopeFiles.assigned = [one, oversized]; vscode.workspace.textDocuments = [];
  assert.strictEqual((await buildZssFunctionCatalog(vscode, uri(one), service, { fileBytes: 1024 })).complete, false, 'per-file byte bounds fail closed');
  const bytesA = path.join(ryu, 'bytes-a.cns'), bytesB = path.join(ryu, 'bytes-b.cns'); fs.writeFileSync(bytesA, ' '.repeat(700)); fs.writeFileSync(bytesB, ' '.repeat(700));
  scope.scopeFiles.assigned = [one, bytesA, bytesB];
  assert.strictEqual((await buildZssFunctionCatalog(vscode, uri(one), service, { totalBytes: 1024 })).complete, false, 'total assigned-code byte bounds fail closed');
  const records = path.join(ryu, 'records.zss'); fs.writeFileSync(records, Array.from({ length: 101 }, (_, index) => `call Engine${index}();`).join('\n'));
  scope.scopeFiles.assigned = [one, records];
  assert.strictEqual((await buildZssFunctionCatalog(vscode, uri(one), service, { records: 100 })).complete, false, 'function/call record bounds fail closed');
  const unreadable = path.join(ryu, 'directory.cns'); fs.mkdirSync(unreadable); scope.scopeFiles.assigned = [one, unreadable];
  assert.strictEqual((await buildZssFunctionCatalog(vscode, uri(one), service)).complete, false, 'an unreadable assigned candidate fails closed');

  // No character-local shortcut: the declared game/project authority domain is
  // searched even when VS Code's workspace query exposes only Ryu.
  const game = path.join(root, 'Game'), gameChars = path.join(game, 'chars'), gameRyu = path.join(gameChars, 'Ryu'), gameKen = path.join(gameChars, 'Ken');
  fs.mkdirSync(path.join(game, 'external', 'script'), { recursive: true }); fs.writeFileSync(path.join(game, 'external', 'script', 'main.lua'), '');
  fs.mkdirSync(gameRyu, { recursive: true }); fs.mkdirSync(gameKen, { recursive: true });
  const localSource = path.join(gameRyu, 'local.zss'), gameRyuDef = path.join(gameRyu, 'Ryu.def'), gameKenDef = path.join(gameKen, 'Ken.def');
  fs.writeFileSync(localSource, '[Function Local(value)]\nreturn $value;');
  fs.writeFileSync(gameRyuDef, '[Files]\nsprite = Ryu.sff\nst = local.zss\n');
  fs.writeFileSync(gameKenDef, '[Files]\nsprite = Ken.sff\nst = Ken.zss\n');
  const gameScope = { root: gameRyu, def: gameRyuDef, characterName: 'Ryu', missingDependencies: [], unsupportedDependencies: [], projectRoots: [], scopeFiles: { assigned: [localSource] } };
  const gameService = { context: {}, scope: () => gameScope };
  vscode.workspace.workspaceFolders = [{ uri: uri(gameRyu) }]; vscode.workspace.textDocuments = [];
  vscode.workspace.findFiles = async () => [uri(gameRyuDef)];
  resetFunctionOwnerCacheForTests();
  let localCatalog = await buildZssFunctionCatalog(vscode, uri(localSource), gameService);
  assert.strictEqual(localCatalog.complete, true, 'ordinary local authoring remains usable after the complete declared game domain proves one owner');
  assert.strictEqual(functionOwnerCacheStats().domainScans, 1);
  assert.strictEqual(await catalogStillCurrent(vscode, localCatalog, gameService), true);
  await buildZssFunctionCatalog(vscode, uri(localSource), gameService);
  assert.strictEqual(functionOwnerCacheStats().domainScans, 1, 'repeated build plus validation reuses one unchanged canonical authority-domain index');
  const secondCaller = path.join(gameRyu, 'second.zss'); fs.writeFileSync(secondCaller, 'call Local(1);');
  fs.writeFileSync(gameRyuDef, '[Files]\nsprite = Ryu.sff\nst = local.zss\nst1 = second.zss\n'); gameScope.scopeFiles.assigned = [localSource, secondCaller];
  resetFunctionOwnerCacheForTests();
  await buildZssFunctionCatalog(vscode, uri(localSource), gameService); await buildZssFunctionCatalog(vscode, uri(secondCaller), gameService);
  assert.strictEqual(functionOwnerCacheStats().domainScans, 1, 'multiple open callers in one owner domain share the same ownership scan');
  for (let index = 0; index < 11; index += 1) fs.writeFileSync(path.join(gameKen, `unrelated-${index}.png`), '');
  invalidateFunctionOwnerCache();
  assert.strictEqual((await buildZssFunctionCatalog(vscode, uri(localSource), gameService, { ownerFiles: 10 })).complete, true, 'unrelated sprite/audio-style files are not read or counted by the DEF ownership index');
  for (let index = 0; index < 11; index += 1) fs.writeFileSync(path.join(gameKen, `filler-${index}.def`), '[Info]\nname = filler\n');
  invalidateFunctionOwnerCache();
  assert.strictEqual((await buildZssFunctionCatalog(vscode, uri(localSource), gameService, { ownerFiles: 10 })).complete, false, 'an exhausted authority-domain DEF file bound cannot claim unique ownership');
  gameScope.projectRoots = [path.join(root, 'MissingDeclaredProject')];
  assert.strictEqual((await buildZssFunctionCatalog(vscode, uri(localSource), gameService)).complete, false, 'an unreadable declared project root makes ownership incomplete');
  gameScope.projectRoots = [];
  fs.writeFileSync(gameKenDef, '[Files]\nsprite = Ken.sff\nst = ../Ryu/local.zss\n');
  invalidateFunctionOwnerCache(); const scansBeforeSecondOwner = functionOwnerCacheStats().domainScans;
  catalog = await buildZssFunctionCatalog(vscode, uri(localSource), gameService);
  assert.strictEqual(catalog.complete, false, 'a second owner elsewhere in the game is found even outside character-only workspace results');
  assert.match(catalog.limitations.join(' '), /2 character DEFs/);
  assert.strictEqual(functionOwnerCacheStats().domainScans, scansBeforeSecondOwner + 1, 'watcher-style invalidation recomputes the ownership index once and catches the new owner');

  fs.writeFileSync(gameKenDef, '[Files]\nsprite = Ken.sff\nst = Ken.zss\n');
  const dirtyKen = live(gameKenDef, 'ikemen-def'); dirtyKen.edit('[Files]\nsprite = Ken.sff\nst = ../Ryu/local.zss\n'); dirtyKen.isDirty = true;
  vscode.workspace.textDocuments = [dirtyKen];
  invalidateFunctionOwnerCache(); const scansBeforeDirty = functionOwnerCacheStats().domainScans;
  catalog = await buildZssFunctionCatalog(vscode, uri(localSource), gameService);
  assert.strictEqual(catalog.complete, false, 'a dirty open second DEF that adds the assignment blocks ownership instead of trusting disk or retained Ryu context');
  assert.match(catalog.limitations.join(' '), /dirty open character DEF/i);
  assert.strictEqual(functionOwnerCacheStats().domainScans, scansBeforeDirty + 1, 'dirty DEF invalidation rebuilds the domain index before live assignment proof');

  const siblingProject = path.join(root, 'SiblingProject'), siblingKen = path.join(siblingProject, 'Ken'); fs.mkdirSync(siblingKen, { recursive: true });
  const siblingDef = path.join(siblingKen, 'Ken.def'), relativeLocal = path.relative(siblingKen, localSource).replace(/\\/g, '/');
  fs.writeFileSync(siblingDef, `[Files]\nsprite = Ken.sff\nst = ${relativeLocal}\n`);
  gameScope.projectRoots = [siblingProject]; vscode.workspace.textDocuments = []; vscode.workspace.findFiles = async () => [uri(gameRyuDef)];
  catalog = await buildZssFunctionCatalog(vscode, uri(localSource), gameService);
  assert.strictEqual(catalog.complete, false, 'an assigning cross-project sibling is found when its project root is declared even outside workspace search results');
  console.log('Owner-scoped ZSS function catalog tests passed');
})().finally(() => fs.rmSync(root, { recursive: true, force: true })).catch(error => { console.error(error); process.exit(1); });
