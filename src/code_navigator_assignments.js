'use strict';

// Code Navigator: legacy code files that a character DEF assigns explicitly but
// whose extension is not otherwise navigable, for example HDBZ GotenksZ2.def
// [Files] st8 = config.txt. Only exact current [Files] code assignments are
// admitted; arbitrary *.txt files are never globbed or guessed.
//
// Bounded and cached: each DEF is read at most once per stat signature, owner
// search walks at most a few directories, and nothing here runs per keystroke
// (callers invalidate only when a DEF changes or on explicit Refresh).

const fs = require('fs');
const path = require('path');
const { parseDef } = require('./def_model');
const { assignedPath } = require('./character_dependency_model');
const { NAVIGABLE_EXTENSIONS } = require('./code_navigator_model');

// Same [Files] code keys that coding_source_admission.js admits.
const CODE_FILE_KEY = /^(?:st\d*|stcommon|common|cns|cmd)$/i;
// Assigned paths with these extensions are assets or other grammars, never legacy CNS text.
const LIMITS = Object.freeze({ defBytes: 1024 * 1024, codeBytes: 4 * 1024 * 1024, assignmentsPerDef: 64, ownerSearchDefs: 32, ownerSearchDepth: 2, workspaceDefs: 500 });

const fileKey = file => path.resolve(String(file)).toLowerCase();

function statOf(file, io) {
  try { const stat = io.statSync(file); return stat.isFile() ? stat : null; } catch (_) { return null; }
}

function signature(stat) { return `${stat.size}:${stat.mtimeMs}`; }

// True for an assigned file that the extension list does not already make navigable.
function extraAssignmentCandidate(file) {
  const extension = path.extname(file).toLowerCase();
  return !NAVIGABLE_EXTENSIONS.includes(extension.slice(1));
}

class DefAssignmentIndex {
  constructor(options = {}) {
    this.io = options.fs || fs;
    this.limits = { ...LIMITS, ...(options.limits || {}) };
    this.defs = new Map(); // def key -> { signature, rows }
    this.owners = new Map(); // code file key -> rows (positive or empty)
    this.workspace = null; // { rows, byFile }
    this.pinned = new Set(); // files assigned by active owner DEFs merged into the workspace list
  }

  invalidate() {
    this.defs.clear();
    this.owners.clear();
    this.pinned.clear();
    this.workspace = null;
  }

  // Exact, existing, extra-extension code assignments of one DEF.
  assignmentsOf(defFile) {
    const owner = path.resolve(String(defFile || ''));
    if (path.extname(owner).toLowerCase() !== '.def') return [];
    const stat = statOf(owner, this.io);
    if (!stat || stat.size > this.limits.defBytes) return [];
    const cached = this.defs.get(fileKey(owner));
    if (cached && cached.signature === signature(stat)) return cached.rows;
    const rows = [];
    try {
      const parsed = parseDef(this.io.readFileSync(owner, 'utf8'), owner);
      for (const section of parsed.sections.filter(entry => entry.normalized === 'files')) {
        for (const entry of section.entries) {
          if (rows.length >= this.limits.assignmentsPerDef) break;
          if (!CODE_FILE_KEY.test(entry.key)) continue;
          const file = assignedPath(owner, entry.value, entry.key, this.io);
          if (!file || !extraAssignmentCandidate(file)) continue;
          const codeStat = statOf(file, this.io);
          if (!codeStat || codeStat.size > this.limits.codeBytes) continue;
          rows.push(Object.freeze({ file: path.resolve(file), owner, key: entry.key, line: entry.line }));
        }
      }
    } catch (_) { /* unreadable DEF admits nothing */ }
    this.defs.set(fileKey(owner), { signature: signature(stat), rows });
    return rows;
  }

  // Owning assignments for one file: DEFs in its directory and up to
  // ownerSearchDepth parents, plus any DEF already indexed by the workspace scan.
  ownersOf(file) {
    const target = path.resolve(String(file || ''));
    if (!target || !extraAssignmentCandidate(target)) return [];
    const key = fileKey(target);
    if (this.owners.has(key)) return this.owners.get(key);
    const found = [], seen = new Set();
    const consider = defFile => {
      if (seen.has(fileKey(defFile)) || seen.size >= this.limits.ownerSearchDefs) return;
      seen.add(fileKey(defFile));
      for (const row of this.assignmentsOf(defFile)) if (fileKey(row.file) === key) found.push(row);
    };
    let directory = path.dirname(target);
    for (let depth = 0; depth <= this.limits.ownerSearchDepth; depth += 1) {
      let names = [];
      try { names = this.io.readdirSync(directory); } catch (_) { names = []; }
      for (const name of names) if (/\.def$/i.test(name)) consider(path.join(directory, name));
      if (path.basename(directory).toLowerCase() === 'chars') break;
      const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
    }
    for (const row of this.workspace?.byFile.get(key) || []) if (!found.some(item => fileKey(item.owner) === fileKey(row.owner) && item.key === row.key)) found.push(row);
    found.sort((a, b) => a.owner.localeCompare(b.owner) || a.line - b.line);
    this.owners.set(key, found);
    return found;
  }

  // Workspace scan over already-discovered DEF files (bounded by the caller's list).
  indexWorkspace(defFiles) {
    const rows = [], byFile = new Map();
    for (const defFile of (defFiles || []).slice(0, this.limits.workspaceDefs)) {
      for (const row of this.assignmentsOf(defFile)) {
        const key = fileKey(row.file);
        if (!byFile.has(key)) { byFile.set(key, []); rows.push(row); }
        byFile.get(key).push(row);
      }
    }
    this.workspace = { rows, byFile };
    this.owners.clear();
    return this.workspace;
  }

  // Workspace rows with the current owner DEFs merged first, so an active
  // character's assignments appear even when its DEF fell outside the capped
  // global scan. Only those exact DEFs are read (cached by stat signature).
  workspaceRows(priorityDefs = []) {
    const rows = [], byFile = new Map();
    const add = row => {
      const key = fileKey(row.file);
      if (!byFile.has(key)) { byFile.set(key, []); rows.push(row); }
      const owners = byFile.get(key);
      if (!owners.some(item => fileKey(item.owner) === fileKey(row.owner) && item.key === row.key)) owners.push(row);
    };
    const seen = new Set();
    for (const defFile of priorityDefs) {
      if (!defFile || seen.has(fileKey(defFile)) || seen.size >= this.limits.ownerSearchDefs) continue;
      seen.add(fileKey(defFile));
      for (const row of this.assignmentsOf(defFile)) { add(row); this.pinned.add(fileKey(row.file)); }
    }
    for (const row of this.workspace?.rows || []) for (const owner of this.workspace.byFile.get(fileKey(row.file)) || [row]) add(owner);
    return { rows, byFile };
  }

  // Cache-only check, safe on hot change paths: never reads the disk.
  isKnownAssignedFile(file) {
    if (!file) return false;
    const key = fileKey(file);
    return Boolean(this.workspace?.byFile.has(key) || this.pinned.has(key) || this.owners.get(key)?.length);
  }
}

function ownerSummary(rows) {
  const owners = [...new Set(rows.map(row => path.basename(row.owner)))];
  return { description: `${rows[0].key} · ${owners.join(', ')}`, tooltip: rows.map(row => `Assigned by ${row.owner} [Files] ${row.key} (line ${row.line + 1})`).join('\n') };
}

module.exports = { CODE_FILE_KEY, LIMITS, DefAssignmentIndex, extraAssignmentCandidate, ownerSummary };
