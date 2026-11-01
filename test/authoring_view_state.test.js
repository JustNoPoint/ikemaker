'use strict';

const assert = require('assert');
const { normalized, AuthoringViewState, MAX_DOCUMENT_STATES, MAX_CONTEXT_STATES } = require('../src/authoring_view_state');

assert.strictEqual(normalized({ mode: 'bad', splitRatio: 9 }).mode, 'visual');
assert.strictEqual(normalized({ splitRatio: 9 }).splitRatio, 0.8);
assert.strictEqual(normalized({ splitRatio: 0 }).splitRatio, 0.2);

const store = new AuthoringViewState();
assert.strictEqual(store.has('character:ryu', 'move.lab'), false);
const changed = store.set('character:ryu', 'move.lab', { mode: 'split', splitRatio: 0.65, focusedPane: 'source', panes: { source: { scrollToken: 'line:42', selectionToken: 'state:400' } } });
assert.strictEqual(store.has('character:ryu', 'move.lab'), true);
assert.strictEqual(changed.mode, 'split'); assert.strictEqual(changed.panes.source.scrollToken, 'line:42'); assert(Object.isFrozen(changed.panes));
assert.strictEqual(store.get('character:ken', 'move.lab').mode, 'visual', 'contexts are isolated');
const native = store.presentation('character:ryu', 'move.lab', 'native');
assert.strictEqual(native.integrated, false); assert.strictEqual(native.mode, 'native'); assert.strictEqual(native.saved.mode, 'split');
assert.strictEqual(store.presentation('character:ryu', 'move.lab', 'integrated').mode, 'split');
assert.throws(() => store.presentation('character:ryu', 'move.lab', 'ask'), /must resolve/);
assert.throws(() => store.presentation('character:ryu', 'move.lab', 'unset'), /must resolve/);
const serialized = store.serialize(), restored = new AuthoringViewState(serialized);
assert.deepStrictEqual(restored.serialize(), serialized);
assert.strictEqual(restored.get('character:ryu', 'move.lab').panes.source.selectionToken, 'state:400');
store.setDocument('character:ryu','move.lab','normal.zss',{selectionStart:8,selectionEnd:14,selectionDirection:'backward',scrollTop:120,scrollLeft:5,focused:true});
assert.deepStrictEqual(store.document('character:ryu','move.lab','normal.zss',10),{selectionStart:8,selectionEnd:10,selectionDirection:'backward',scrollTop:120,scrollLeft:5},'offsets clamp against current host text length and focus is never persisted');
assert.strictEqual(store.document('character:ryu','move.lab','other.zss').selectionStart,0,'documents are isolated');
for(let index=0;index<MAX_DOCUMENT_STATES+5;index++)store.setDocument('character:bounded','code.authoring-workspace',`file-${index}`,{selectionStart:index,selectionEnd:index});
assert.strictEqual(Object.keys(store.get('character:bounded','code.authoring-workspace').documents).length,MAX_DOCUMENT_STATES);
assert.strictEqual(store.get('character:bounded','code.authoring-workspace').documents[`file-${MAX_DOCUMENT_STATES+4}`].selectionStart,MAX_DOCUMENT_STATES+4,'the newest bounded document state is retained');
const migrated=new AuthoringViewState({version:1,entries:[{identity:'legacy\0code',state:{mode:'source'}}]});
assert.strictEqual(migrated.get('legacy','code').mode,'source'); assert.deepStrictEqual(migrated.get('legacy','code').documents,{});
assert.strictEqual(normalized({panes:{source:{scrollToken:'x'.repeat(5000)}}}).panes.source.scrollToken,'','oversized legacy tokens are discarded');
const hostileEntries=Array.from({length:MAX_CONTEXT_STATES+10},(_,index)=>({identity:`context-${index}\0code`,state:{mode:'source'}})); hostileEntries.push({identity:`${'x'.repeat(5000)}\0code`,state:{mode:'split'}});
const hostile=new AuthoringViewState({version:2,entries:hostileEntries}); assert(hostile.states.size<=MAX_CONTEXT_STATES); assert.strictEqual([...hostile.states.keys()].some(identity=>identity.length>4353),false);
assert.strictEqual(restored.restore({ version: 99, entries: [] }), false);
console.log('Visual, Source, Split presentation state and Native bypass preservation passed');
