'use strict';

function createWorkbookReader() {
  const mainNamespaces = [
    'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'http://purl.oclc.org/ooxml/spreadsheetml/main'
  ];
  const documentRelationships = [
    'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'http://purl.oclc.org/ooxml/officeDocument/relationships'
  ];
  const packageRelationships = [
    'http://schemas.openxmlformats.org/package/2006/relationships',
    'http://purl.oclc.org/ooxml/package/relationships'
  ];
  const maximumRows = 160, maximumColumns = 32, maximumSheets = 128;
  const maximumStrings = 50000, maximumCellText = 1000;

  function xmlRoot(source, name, namespaces) {
    if (typeof source !== 'string' || /<\s*!\s*(DOCTYPE|ENTITY)\b/i.test(source)) throw new Error('Unsupported workbook XML.');
    const root = new DOMParser().parseFromString(source, 'application/xml').documentElement;
    if (!root || root.localName !== name || !namespaces.includes(root.namespaceURI)) throw new Error('The workbook XML is invalid or unsupported.');
    return root;
  }

  function children(node, name) {
    return Array.from(node?.children ?? []).filter(child => child.localName === name && child.namespaceURI === node.namespaceURI);
  }

  function child(node, name) {
    return children(node, name)[0];
  }

  function partName(target) {
    if (!target) return null;
    const name = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
    if (!/^xl\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.xml$/.test(name) ||
        name.split('/').some(segment => segment === '.' || segment === '..')) return null;
    return name;
  }

  function index(source) {
    const book = xmlRoot(source.workbook, 'workbook', mainNamespaces);
    const links = xmlRoot(source.relationships, 'Relationships', packageRelationships);
    const relationships = new Map();
    let strings = null;
    for (const rel of children(links, 'Relationship')) {
      const id = rel.getAttribute('Id'), type = rel.getAttribute('Type') || '';
      if (!id || relationships.has(id)) throw new Error('The workbook contains an invalid relationship ID.');
      const part = rel.hasAttribute('TargetMode') && rel.getAttribute('TargetMode') !== 'Internal' ? null : partName(rel.getAttribute('Target'));
      const worksheet = documentRelationships.some(namespace => type === namespace + '/worksheet');
      relationships.set(id, worksheet ? part : null);
      if (part && documentRelationships.some(namespace => type === namespace + '/sharedStrings')) strings = part;
    }
    const activeTab = Number(child(child(book, 'bookViews'), 'workbookView')?.getAttribute('activeTab') || 0);
    const sheets = [], sheetNames = new Set();
    let skipped = 0;
    children(child(book, 'sheets'), 'sheet').forEach((sheet, originalIndex) => {
      if (['hidden', 'veryHidden'].includes(sheet.getAttribute('state'))) return;
      const relation = documentRelationships.map(namespace => sheet.getAttributeNS(namespace, 'id')).find(Boolean);
      const part = relationships.get(relation), name = sheet.getAttribute('name');
      if (!part || !name || name.length > 120 || sheetNames.has(name) || sheets.length >= maximumSheets) {
        skipped++;
        return;
      }
      sheetNames.add(name);
      sheets.push({ part, name, originalIndex });
    });
    return { sheets, strings, skipped, activeSheet: sheets.findIndex(sheet => sheet.originalIndex === activeTab) };
  }

  function readable(value) {
    return value.length > maximumCellText ? value.slice(0, maximumCellText) + '…' : value;
  }

  function richText(element) {
    return Array.from(element?.children ?? [])
      .filter(node => node.namespaceURI === element.namespaceURI)
      .map(node => node.localName === 't' ? node.textContent : node.localName === 'r' ? child(node, 't')?.textContent || '' : '')
      .join('');
  }

  function strings(source) {
    return children(xmlRoot(source, 'sst', mainNamespaces), 'si').slice(0, maximumStrings).map(element => readable(richText(element)));
  }

  function coordinate(value) {
    const match = /^([A-Z]{1,3})([1-9][0-9]{0,6})$/.exec(value);
    if (!match) return null;
    let column = 0;
    for (const symbol of match[1]) column = column * 26 + symbol.charCodeAt(0) - 64;
    return { column, row: Number(match[2]) };
  }

  function valueFor(cell, shared) {
    const type = cell.getAttribute('t');
    if (type === 'inlineStr') return { text: readable(richText(child(cell, 'is'))) };
    const value = child(cell, 'v')?.textContent;
    if ((value === undefined || value === '') && child(cell, 'f')) return { text: 'No cached value', missing: true };
    if (!value) return { text: '' };
    if (type === 's') {
      const index = /^\d{1,9}$/.test(value) ? Number(value) : -1;
      return Object.hasOwn(shared, index) ? { text: shared[index] } : { text: 'Shared text unavailable', missing: true };
    }
    if (type === 'b' && (value === '0' || value === '1')) return { text: value === '1' ? 'TRUE' : 'FALSE' };
    return { text: readable(value) };
  }

  function worksheet(source, shared = []) {
    const sheet = xmlRoot(source, 'worksheet', mainNamespaces), data = child(sheet, 'sheetData');
    let rowNumber = 0, height = 0, width = 0, truncated = false;
    const cells = [];
    for (const row of children(data, 'row')) {
      rowNumber = Number(row.getAttribute('r') || rowNumber + 1);
      let columnNumber = 0;
      for (const cell of children(row, 'c')) {
        const reference = cell.getAttribute('r'), position = reference ? coordinate(reference) : { row: rowNumber, column: columnNumber + 1 };
        if (!position) throw new Error('The worksheet contains an invalid cell position.');
        columnNumber = position.column;
        if (!Number.isInteger(position.row) || position.row < 1 || position.row > 1048576) throw new Error('The worksheet contains an invalid row number.');
        if (position.row > maximumRows || position.column > maximumColumns) { truncated = true; continue; }
        const value = valueFor(cell, shared);
        if (!value.text) continue;
        height = Math.max(height, position.row);
        width = Math.max(width, position.column);
        cells[position.row] ||= [];
        cells[position.row][position.column] = value;
      }
    }
    return { cells, height, width, truncated, maximumRows, maximumColumns };
  }

  return { index, strings, worksheet };
}

function runBible(vscode, createWorkbookReader, scope) {
  const reader = createWorkbookReader();
  const get = id => document.getElementById(id);
  const library = get('bibleDocuments'), content = get('bibleContent'), status = get('bibleStatus');
  const newNote = get('bibleNewNote'), addFiles = get('bibleAddFiles');
  let documents = [], selected = null, book = null, previewId = 0, sheetRequest = 0;
  let saved = { ...(vscode.getState() || {}), ...scope };
  vscode.setState(saved);
  globalThis.ikemenHasUnappliedForms = () => false;

  function persist() {
    vscode.setState(saved = { ...saved, documentId: selected, sheetIndex: book?.active });
  }

  function button(label, action) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = label;
    control.onclick = action;
    return control;
  }

  function paragraph(text, className) {
    const line = document.createElement('p');
    line.textContent = text;
    if (className) line.className = className;
    return line;
  }

  function image(src, alt) {
    const node = document.createElement('img');
    node.alt = alt;
    node.decoding = 'async';
    node.onerror = () => node.replaceWith(paragraph('Image preview could not be decoded.', 'muted'));
    if (/^data:image\/(?:png|jpeg|gif|webp);base64,/.test(src)) node.src = src;
    return node;
  }

  function renderLibrary() {
    const focusedId = library.contains(document.activeElement) ? document.activeElement.dataset.id : null;
    library.replaceChildren();
    for (const entry of documents) {
      const row = document.createElement('li');
      const control = button(entry.title, () => select(entry.id));
      control.dataset.id = entry.id;
      control.setAttribute('aria-current', entry.id === selected ? 'true' : 'false');
      control.title = entry.name;
      row.append(control);
      library.append(row);
      if (entry.id === focusedId) control.focus();
    }
    get('bibleEmpty').hidden = documents.length > 0;
  }

  function select(id, restoreSheet) {
    const entry = documents.find(row => row.id === id);
    if (!entry) return;
    selected = id;
    book = null;
    const request = ++previewId;
    if (restoreSheet === undefined) persist();
    renderLibrary();
    content.replaceChildren(paragraph('Loading ' + entry.title + '…', 'muted'));
    vscode.postMessage({ type: 'preview', id, request, restoreSheet });
  }

  function addInline(parent, value, images, budget) {
    // Plain strings and explicitly resolved raster references are the only inline output.
    const matches = /!\[([^\]\r\n]{0,200})\]\(([^)\r\n]{1,240})\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`/g;
    let end = 0;
    for (const match of value.matchAll(matches)) {
      parent.append(document.createTextNode(value.slice(end, match.index)));
      if (match[1] !== undefined) {
        const src = images.get(match[2].trim()), alt = match[1] || 'Bible image';
        if (src && budget.remaining > 0) {
          budget.remaining--;
          parent.append(image(src, alt));
        } else {
          parent.append(document.createTextNode('[Image unavailable: ' + alt + ']'));
        }
      } else {
        const markup = document.createElement(match[3] !== undefined ? 'strong' : 'code');
        markup.textContent = match[3] ?? match[4];
        parent.append(markup);
      }
      end = match.index + match[0].length;
    }
    parent.append(document.createTextNode(value.slice(end)));
  }

  function renderMarkdown(element, text, attachments) {
    const images = new Map(attachments.map(item => [item.reference, item.src]));
    const budget = { remaining: 12 };
    const lines = text.split(/\r?\n/);
    let list = null, code = null;
    for (const line of lines.slice(0, 4000)) {
      if (line.startsWith('```')) {
        if (code) code = null;
        else { code = document.createElement('pre'); element.append(code); }
        list = null;
        continue;
      }
      if (code) { code.append(document.createTextNode(line + '\n')); continue; }
      if (!line.trim()) { list = null; continue; }
      const heading = /^(#{1,5})\s+(.+)$/.exec(line);
      const item = /^\s*[-*]\s+(.+)$/.exec(line);
      if (item) {
        if (!list) { list = document.createElement('ul'); element.append(list); }
        const row = document.createElement('li');
        addInline(row, item[1], images, budget);
        list.append(row);
        continue;
      }
      list = null;
      const node = document.createElement(heading ? 'h' + (heading[1].length + 1) : 'p');
      addInline(node, heading ? heading[2] : line, images, budget);
      element.append(node);
    }
    if (lines.length > 4000) element.append(paragraph('Preview shows the first 4,000 lines.', 'muted'));
  }

  function documentHeader(entry) {
    const header = document.createElement('header');
    const title = document.createElement('h2');
    title.textContent = entry.title;
    header.append(title);
    if (entry.kind === 'text') header.append(button(entry.createdHere ? 'Edit Note' : 'Edit Copy', () => vscode.postMessage({ type: 'editText', id: entry.id })));
    if (entry.kind === 'image') header.append(button('Copy Image Reference', () => vscode.postMessage({ type: 'copyImageReference', id: entry.id })));
    return header;
  }

  function provenance(entry) {
    const details = document.createElement('details');
    if (!entry.original) return document.createDocumentFragment();
    const summary = document.createElement('summary');
    summary.textContent = 'Original file details';
    const { name, addedAt, bytes, sha256 } = entry.original;
    details.append(summary, paragraph(name + ' · ' + bytes.toLocaleString() + ' bytes · Copied ' + new Date(addedAt).toLocaleString(), 'muted'));
    details.append(paragraph('Original SHA-256 ' + sha256, 'muted'));
    return details;
  }

  function openSheet(index) {
    if (!Number.isInteger(index) || !book.sheets[index]) return;
    book.active = index;
    book.choice.value = String(index);
    book.table.replaceChildren(paragraph('Loading worksheet…', 'muted'));
    persist();
    vscode.postMessage({ type: 'worksheet', id: selected, request: previewId, sheetRequest: ++sheetRequest,
      part: book.sheets[index].part, strings: book.shared === undefined ? book.strings : null });
  }

  function renderWorkbook(message, entry) {
    const indexed = reader.index(message);
    content.replaceChildren(documentHeader(entry), provenance(entry), paragraph(
      'Read-only worksheet preview. Formula cells show cached values when available. Formatted numbers and dates show raw Excel values. Charts and calculation are unavailable.', 'muted'));
    if (indexed.skipped) content.append(paragraph('Some visible sheets exceed the sheet limit or use an unsupported sheet type.', 'muted'));
    if (!indexed.sheets.length) {
      content.append(paragraph('This workbook has no visible worksheets available to preview.'));
      persist();
      return;
    }
    const picker = document.createElement('label');
    picker.className = 'worksheet-picker';
    picker.append('Worksheet ');
    const choice = document.createElement('select');
    indexed.sheets.forEach((sheet, index) => choice.add(new Option(sheet.name, String(index))));
    choice.onchange = () => openSheet(Number(choice.value));
    picker.append(choice);
    const table = document.createElement('div');
    table.className = 'worksheet';
    table.tabIndex = 0;
    table.setAttribute('aria-label', 'Worksheet preview');
    content.append(picker, table);
    book = { ...indexed, choice, table };
    const requested = message.restoreSheet;
    openSheet((Number.isInteger(requested) && indexed.sheets[requested]) ? requested : Math.max(indexed.activeSheet, 0));
  }

  function columnLabel(number) {
    let text = '';
    for (let n = number; n > 0; n = Math.floor((n - 1) / 26)) text = String.fromCharCode(65 + (n - 1) % 26) + text;
    return text;
  }

  function renderWorksheet(message) {
    if (message.shared) book.shared = reader.strings(message.shared);
    const { cells, height, width, truncated, maximumRows, maximumColumns } = reader.worksheet(message.xml, book.shared || []);
    book.table.replaceChildren();
    if (truncated) book.table.append(paragraph('Preview shows up to the first ' + maximumRows + ' rows and ' + maximumColumns + ' columns.', 'muted'));
    if (!height || !width) { book.table.append(paragraph('There are no populated cells in the preview area.')); return; }
    const table = document.createElement('table');
    table.setAttribute('aria-label', book.sheets[book.active].name);
    const headers = table.createTHead().insertRow();
    headers.append(document.createElement('th'));
    for (let col = 1; col <= width; col++) {
      const heading = document.createElement('th');
      heading.scope = 'col';
      heading.textContent = columnLabel(col);
      headers.append(heading);
    }
    const body = table.createTBody();
    for (let i = 1; i <= height; i++) {
      const row = body.insertRow(), heading = document.createElement('th');
      heading.scope = 'row';
      heading.textContent = String(i);
      row.append(heading);
      for (let j = 1; j <= width; j++) {
        const cell = row.insertCell(), value = cells[i]?.[j];
        if (value) cell.textContent = value.text;
        if (value?.missing) cell.className = 'muted';
      }
    }
    book.table.append(table);
  }

  function renderPreview(message) {
    const entry = documents.find(row => row.id === selected);
    if (!entry) return;
    if (message.kind === 'workbook') { renderWorkbook(message, entry); return; }
    persist();
    content.replaceChildren(documentHeader(entry), provenance(entry));
    if (message.kind === 'image') content.append(image(message.src, entry.title));
    else if (message.kind === 'markdown') renderMarkdown(content, message.text, message.images);
    else if (message.kind === 'text') {
      const text = document.createElement('pre');
      text.textContent = message.text;
      content.append(text);
    }
  }

  newNote.onclick = () => vscode.postMessage({ type: 'newNote' });
  addFiles.onclick = () => vscode.postMessage({ type: 'addFiles' });
  get('bibleRefresh').onclick = () => vscode.postMessage({ type: 'refresh' });
  get('bibleClose').onclick = () => vscode.postMessage({ type: 'close' });
  addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'library') {
      get('bibleTitle').textContent = 'Bible · ' + message.title;
      get('bibleDocuments').setAttribute('aria-label', message.label + ' documents');
      const unavailable = get('bibleUnavailable');
      unavailable.hidden = !message.unavailable;
      unavailable.textContent = message.unavailable ? message.unavailable + ' document(s) could not be loaded from Bible storage.' : '';
      documents = message.documents;
      renderLibrary();
      const target = message.open || (!selected ? saved.documentId : null);
      if (target && documents.some(item => item.id === target)) select(target, message.open ? undefined : saved.sheetIndex);
      if (selected && !documents.some(item => item.id === selected)) {
        selected = null;
        book = null;
        persist();
        content.replaceChildren(paragraph('The selected document is unavailable.', 'muted'));
      }
    } else if (message.type === 'documentChanged' && message.id === selected) {
      select(selected, book?.active);
    } else if (message.type === 'status') {
      status.textContent = message.text;
      newNote.disabled = addFiles.disabled = message.busy === true;
    } else if (message.request === previewId && message.id === selected &&
        (message.sheetRequest === undefined || message.sheetRequest === sheetRequest)) {
      const target = message.sheetRequest !== undefined ? book?.table : content;
      try {
        if (message.type === 'preview') renderPreview(message);
        else if (message.type === 'sheet' && book) renderWorksheet(message);
        else if (message.type === 'previewError') target?.replaceChildren(paragraph(message.text, 'error'));
      } catch (error) {
        target?.replaceChildren(paragraph(error.message, 'error'));
      }
    }
  });
  vscode.postMessage({ type: 'ready' });
}

function bibleClientScript(scope) {
  return `(${runBible})(vscode, ${createWorkbookReader}, ${JSON.stringify(scope).replace(/</g, '\\u003c')});`;
}

module.exports = { bibleClientScript, createWorkbookReader };
