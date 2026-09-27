'use strict';

const assert = require('assert');
const { sourceState, saveSourceDocument } = require('../src/source_document_save');

function document({ dirty = true, result = true, afterDirty = false, error = null } = {}) {
  return {
    fileName: 'C:\\game\\chars\\Ryu\\Anim.air',
    isDirty: dirty,
    calls: 0,
    async save() {
      this.calls += 1;
      if (error) throw error;
      this.isDirty = afterDirty;
      return result;
    }
  };
}

(async () => {
  const clean = document({ dirty: false }), cleanResult = await saveSourceDocument(clean, 'Anim.air');
  assert.strictEqual(clean.calls, 0, 'a clean source must not receive a redundant save');
  assert(cleanResult.ok && !cleanResult.dirty);

  const saved = document(), savedResult = await saveSourceDocument(saved, 'Anim.air');
  assert.strictEqual(saved.calls, 1);
  assert(savedResult.ok && !savedResult.dirty && /saved to disk/.test(savedResult.message));

  const refused = document({ result: false, afterDirty: true }), refusedResult = await saveSourceDocument(refused, 'Anim.air');
  assert(!refusedResult.ok && refusedResult.dirty && /not saved/.test(refusedResult.message));

  const raced = document({ result: true, afterDirty: true }), racedResult = await saveSourceDocument(raced, 'Anim.air');
  assert(!racedResult.ok && racedResult.dirty && /newer document changes remain unsaved/.test(racedResult.message));

  const failed = document({ error: new Error('locked'), afterDirty: true }), failedResult = await saveSourceDocument(failed, 'Anim.air');
  assert(!failedResult.ok && failedResult.dirty && /locked/.test(failedResult.message));
  assert.strictEqual(sourceState(null, 'Missing').available, false);
  console.log('Exact source document save status tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
