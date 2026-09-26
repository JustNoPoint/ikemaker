'use strict';

const vscode = require('vscode');
const { collectRecords } = require('./analyzer');

const GROUPS = [
  ['maps', 'Maps', 'symbol-variable'],
  ['variables', 'Vars / FVars / SysVars', 'symbol-number'],
  ['functions', 'Functions', 'symbol-function'],
  ['calls', 'Function Calls', 'references'],
  ['states', 'State Numbers', 'symbol-class'],
  ['resources', 'Helper / Explod / Projectile IDs', 'symbol-key']
];

function emptyData() { return { maps: [], variables: [], functions: [], calls: [], states: [], resources: [] }; }

class RegistryItem extends vscode.TreeItem {
  constructor(label, collapsibleState, data = {}) { super(label, collapsibleState); Object.assign(this, data); }
}

class ZssRegistryProvider {
  constructor(api = vscode, collector = collectRecords) {
    this.vscode = api;
    this.collector = collector;
    this.changeEmitter = new api.EventEmitter();
    this.onDidChangeTreeData = this.changeEmitter.event;
    this.cache = null;
    this.pending = null;
    this.revision = 0;
    this.status = 'idle';
    this.failure = '';
    this.skipped = 0;
  }

  refresh() {
    this.revision += 1; this.cache = null; this.pending = null; this.status = 'idle'; this.failure = ''; this.skipped = 0;
    this.changeEmitter.fire(undefined);
  }

  async scan() {
    if (this.cache) return this.cache;
    if (this.pending) return this.pending;
    const revision = this.revision, api = this.vscode;
    this.status = 'scanning'; this.failure = ''; this.skipped = 0;
    this.pending = (async () => {
      const limit = api.workspace.getConfiguration('ikemenZss').get('maxAuditFiles', 1000);
      const uris = await api.workspace.findFiles('**/*.zss', '**/{.git,node_modules}/**', limit);
      const all = emptyData(); let skipped = 0;
      for (const uri of uris) {
        try {
          const document = await api.workspace.openTextDocument(uri);
          const records = this.collector(document.getText(), api.workspace.asRelativePath(uri, false));
          for (const key of Object.keys(all)) all[key].push(...records[key].map((record) => ({ ...record, uri })));
        } catch (_) { skipped += 1; }
      }
      if (revision === this.revision) { this.cache = all; this.skipped = skipped; this.status = skipped ? 'partial' : 'ready'; }
      return all;
    })().catch((error) => {
      const all = emptyData();
      if (revision === this.revision) { this.cache = all; this.status = 'failed'; this.failure = error?.message || String(error); }
      return all;
    });
    try { return await this.pending; } finally { if (revision === this.revision) this.pending = null; }
  }

  startScan() {
    void this.scan().then(() => this.changeEmitter.fire(undefined)).catch(() => this.changeEmitter.fire(undefined));
  }

  statusText() {
    if (this.status === 'failed') return `Legacy ZSS inventory failed: ${this.failure || 'unknown error'}. Use Refresh to retry.`;
    if (this.status === 'partial') return `Legacy ZSS inventory is partial: ${this.skipped} unreadable file(s) skipped. Use Refresh to retry.`;
    if (this.status === 'scanning' || this.status === 'idle') return 'Legacy ZSS inventory is scanning…';
    return 'Workspace-wide ZSS inventory';
  }

  browseMapsItem() {
    const item = new RegistryItem('Browse Maps…', this.vscode.TreeItemCollapsibleState.None, { nodeType: 'registryAction', contextValue: 'zssRegistryBrowseMaps' });
    item.iconPath = new this.vscode.ThemeIcon('open-preview');
    item.description = 'scoped ZSS/CNS map browser';
    item.tooltip = 'Open the scoped multi-format Project Maps browser. This is separate from the workspace-wide ZSS inventory below.';
    item.command = { command: 'ikemen.maps.openBrowser', title: 'Browse Project Maps' };
    return item;
  }

  async getChildren(element) {
    if (!element) {
      const data = this.cache; if (!data) this.startScan();
      return GROUPS.map(([key, label, icon]) => {
        const unique = data ? new Set(data[key].map((record) => record.name)).size : null;
        const suffix = this.status === 'failed' ? 'scan failed' : unique === null ? 'scanning…' : this.status === 'partial' ? `${unique}, partial` : unique;
        const item = new RegistryItem(`${label} (${suffix})`, this.vscode.TreeItemCollapsibleState.Collapsed, { nodeType: 'registryGroup', key, contextValue: 'zssRegistryGroup' });
        item.iconPath = new this.vscode.ThemeIcon(icon); item.description = this.statusText(); return item;
      });
    }
    if (element.nodeType !== 'registryGroup') return [];
    const browseMaps = element.key === 'maps' ? this.browseMapsItem() : null;
    const data = this.cache;
    if (!data) { this.startScan(); return browseMaps ? [browseMaps] : []; }
    const grouped = new Map();
    for (const record of data[element.key]) { if (!grouped.has(record.name)) grouped.set(record.name, []); grouped.get(record.name).push(record); }
    const inventory = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([name, records]) => {
      const writes = records.filter((record) => record.access === 'write').length, reads = records.filter((record) => record.access === 'read').length, first = records[0];
      const item = new RegistryItem(name, this.vscode.TreeItemCollapsibleState.None, { nodeType: 'registryItem', uri: first.uri, line: first.line, contextValue: 'zssRegistryItem' });
      item.description = element.key === 'maps' || element.key === 'variables' ? `${writes}W / ${reads}R · ${records.length} use(s)` : `${records.length} occurrence(s)`;
      item.tooltip = records.slice(0, 20).map((record) => `${record.file}:${record.line + 1} ${record.access || ''}`.trim()).join('\n');
      item.iconPath = new this.vscode.ThemeIcon(records.length > 1 && ['functions', 'states', 'resources'].includes(element.key) ? 'warning' : 'symbol-field');
      item.command = { command: 'zssNavigator.reveal', title: 'Reveal ZSS Registry Entry', arguments: [item] }; return item;
    });
    return browseMaps ? [browseMaps, ...inventory] : inventory;
  }

  getTreeItem(element) { return element; }
}

module.exports = { ZssRegistryProvider, emptyData };
