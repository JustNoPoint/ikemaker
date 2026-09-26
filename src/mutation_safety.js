'use strict';

const path = require('path');
const crypto = require('crypto');

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function buffer(content, encoding = 'utf8') {
  return Buffer.isBuffer(content) ? content : Buffer.from(String(content), encoding);
}

function stamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-');
}

function cleanLabel(value) {
  return String(value || 'edit').replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || 'edit';
}

function token(options = {}) {
  return options.token || `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mutationRoot(filename, options = {}) {
  const candidate = path.resolve(options.journalRoot || path.dirname(filename));
  const marker = `${path.sep}.ikemen-tools${path.sep}`, index = `${candidate}${path.sep}`.toLowerCase().indexOf(marker.toLowerCase());
  return index >= 0 ? candidate.slice(0, index) : candidate;
}

function backupPath(filename, options = {}, id = token(options)) {
  const root = path.join(mutationRoot(filename, options), '.ikemen-tools', 'backups');
  return path.join(root, `${path.basename(filename)}.before-${cleanLabel(options.label)}-${stamp(options.now)}-${id}.bak`);
}

function journalPath(root) {
  return path.join(root, '.ikemen-tools', 'mutations.json');
}

function appendJournal(fs, root, entry, maximum = 200) {
  try {
    const filename = journalPath(root);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    let data = { version: 1, entries: [] };
    if (fs.existsSync(filename)) {
      try { data = JSON.parse(fs.readFileSync(filename, 'utf8')); } catch (_) {}
    }
    if (!data || !Array.isArray(data.entries)) data = { version: 1, entries: [] };
    data.entries = [...data.entries, entry].slice(-maximum);
    fs.writeFileSync(filename, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    return filename;
  } catch (_) { return ''; }
}

function prepare(fs, filename, content, options, id) {
  const target = path.resolve(filename), data = buffer(content, options.encoding);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const exists = fs.existsSync(target);
  const before = exists ? fs.readFileSync(target) : null;
  const expectedHash = options.expectedHashes && options.expectedHashes[target] || options.expectedHash;
  if (expectedHash && hash(before || Buffer.alloc(0)) !== expectedHash) {
    throw new Error(`The file changed after it was loaded and was not overwritten: ${target}`);
  }
  if (exists && options.allowExisting === false) throw new Error(`A file already exists and was not replaced: ${target}`);
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${id}.tmp`);
  const rollback = path.join(path.dirname(target), `.${path.basename(target)}.${id}.rollback`);
  fs.writeFileSync(temporary, data);
  return { target, data, exists, before, beforeHash: before ? hash(before) : '', afterHash: hash(data), temporary, rollback, backup: '' };
}

function restore(fs, item) {
  const failures=[];
  try {
    if (fs.existsSync(item.rollback)) {
      if (fs.existsSync(item.target)) fs.unlinkSync(item.target);
      fs.renameSync(item.rollback, item.target);
    } else if (!item.exists && item.installed && fs.existsSync(item.target)) {
      fs.unlinkSync(item.target);
    }
  } catch (error) { failures.push({file:item.target,recovery:item.rollback,error:error.message}); }
  try { if (fs.existsSync(item.temporary)) fs.unlinkSync(item.temporary); } catch (error) { failures.push({file:item.temporary,recovery:item.rollback,error:error.message}); }
  return failures;
}

function transactionalWriteSet(fs, writes, options = {}) {
  const id = token(options), seen = new Set(), prepared = [];
  try {
    for (const [filename, content] of writes) {
      const target = path.resolve(filename).toLowerCase();
      if (seen.has(target)) throw new Error(`The mutation contains the same target more than once: ${filename}`);
      seen.add(target); prepared.push(prepare(fs, filename, content, options, id));
    }
    for (const item of prepared) {
      if (item.exists) fs.renameSync(item.target, item.rollback);
      fs.renameSync(item.temporary, item.target);
      item.installed = true;
    }
  } catch (error) {
    const failures=prepared.slice().reverse().flatMap(item=>restore(fs,item));
    if(failures.length){const recoveryError=new Error(error.message+'\nRecovery was incomplete. Keep these files until recovery is finished:\n'+failures.map(item=>item.file+' — original/recovery path: '+item.recovery+' ('+item.error+')').join('\n'),{cause:error});recoveryError.name='MutationRecoveryError';recoveryError.recoveryFailures=failures;throw recoveryError;}
    throw error;
  }
  const cleanupFailures=[];
  for (const item of prepared) {try {if(fs.existsSync(item.rollback))fs.unlinkSync(item.rollback);}catch(error){cleanupFailures.push({file:item.target,recovery:item.rollback,error:error.message});}}
  if(cleanupFailures.length){const warning=new Error('The new contents were saved successfully, but temporary recovery files could not be removed. Do not repeat the edit to fix cleanup. Retained originals:\n'+cleanupFailures.map(item=>item.recovery+' ('+item.error+')').join('\n'));warning.name='MutationCleanupError';warning.committed=true;warning.recoveryFailures=cleanupFailures;throw warning;}
  const entries = prepared.map((item) => {
    const root = mutationRoot(item.target, options);
    return {
      time: (options.now || new Date()).toISOString(), operation: options.label || 'edit',
      file: path.relative(root, item.target).replace(/\\/g, '/'), bytes: item.data.length,
      beforeHash: item.beforeHash, afterHash: item.afterHash,
      backup: item.backup ? path.relative(root, item.backup).replace(/\\/g, '/') : ''
    };
  });
  let aggregateJournal = '';
  if (options.journal === true && options.aggregateJournal && prepared.length) {
    const root = mutationRoot(prepared[0].target, options);
    aggregateJournal = appendJournal(fs, root, {
      time: (options.now || new Date()).toISOString(), operation: options.label || 'edit',
      file: `${prepared.length} files`, bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
      files: entries.map((entry) => entry.file)
    }, options.maximumHistory || 200);
  }
  const results = entries.map((entry, index) => {
    const root = mutationRoot(prepared[index].target, options);
    const journal = options.journal !== true ? '' : options.aggregateJournal ? aggregateJournal : appendJournal(fs, root, entry, options.maximumHistory || 200);
    return { ...entry, filename: prepared[index].target, backup: prepared[index].backup, journal };
  });
  return results;
}

function transactionalWrite(fs, filename, content, options = {}) {
  return transactionalWriteSet(fs, [[filename, content]], options)[0];
}

function beginExternalMutation(fs, filename, options = {}) {
  const target = path.resolve(filename), root = mutationRoot(target, options), exists = fs.existsSync(target);
  const before = exists ? fs.readFileSync(target) : null, beforeHash = before ? hash(before) : '', id = token(options);
  let backup = '';
  let finished = false;
  return {
    target, backup,
    rollback() {
      if (finished) return;
      if (exists) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, before); }
      else if (!exists && fs.existsSync(target)) fs.unlinkSync(target);
      finished = true;
    },
    complete() {
      if (finished) throw new Error('External mutation guard has already finished.');
      if (!fs.existsSync(target)) throw new Error(`The external builder did not create its expected output: ${target}`);
      const after = fs.readFileSync(target), entry = {
        time: (options.now || new Date()).toISOString(), operation: options.label || 'external-build',
        file: path.relative(root, target).replace(/\\/g, '/'), bytes: after.length,
        beforeHash, afterHash: hash(after), backup: backup ? path.relative(root, backup).replace(/\\/g, '/') : ''
      };
      const journal = options.journal !== true ? '' : appendJournal(fs, root, entry, options.maximumHistory || 200);
      finished = true; return { ...entry, filename: target, backup, journal };
    }
  };
}

function optionsFromConfig(vscode, filename, label, overrides = {}) {
  const resource = vscode.Uri.file(filename), config = vscode.workspace.getConfiguration('ikemenZss', resource);
  return {
    label,
    backup: false,
    journal: config.get('mutationHistory', false),
    maximumHistory: config.get('mutationHistoryLimit', 200),
    ...overrides
  };
}

function policyFromConfig(vscode, filename) {
  if (!vscode || !vscode.workspace || !vscode.Uri) return { backups: false, history: false, historyLimit: 200 };
  const config = vscode.workspace.getConfiguration('ikemenZss', vscode.Uri.file(filename));
  return {
    backups: false,
    history: config.get('mutationHistory', false),
    historyLimit: config.get('mutationHistoryLimit', 200)
  };
}

module.exports = { hash, buffer, stamp, cleanLabel, backupPath, journalPath, appendJournal, transactionalWrite, transactionalWriteSet, beginExternalMutation, optionsFromConfig, policyFromConfig };
