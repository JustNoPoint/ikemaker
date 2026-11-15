'use strict';

// Interchange syntax shared with Media Editor's ExportManifest.cs. File values
// deliberately have no inline-comment or quoting syntax: punctuation is data.
const HEADER = '; IKeMaker export manifest\n\n';

function integer(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !/^[+-]?\d+$/.test(value.trim())) return null;
    const number = Number(value);
    return Number.isInteger(number) && number >= -2147483648 && number <= 2147483647 ? number : null;
}

function pair(value) {
    const parts = value.split(',');
    if (parts.length !== 2) return null;
    const values = parts.map(integer);
    return values.every(value => value !== null) ? values : null;
}

function read(text) {
    const entries = [], errors = [];
    let current = null;
    function finish() {
        if (!current) return;
        if (!current.file) errors.push(`line ${current.line}: ${current.type} ${current.group},${current.index} has no file`);
        else {
            const { line, ...entry } = current;
            entries.push(entry);
        }
        current = null;
    }
    String(text).split('\n').forEach((raw, offset) => {
        const line = raw.trim(), n = offset + 1;
        if (!line || line.startsWith(';')) return;
        if (line.startsWith('[') && line.endsWith(']')) {
            finish();
            const section = /^(\S+)\s+(.+)$/.exec(line.slice(1, -1).trim());
            const ids = section && pair(section[2]);
            if (!ids) errors.push(`line ${n}: can't read section "${line}"`);
            else current = { type: section[1].toLowerCase(), group: ids[0], index: ids[1], line: n };
            return;
        }
        const eq = line.indexOf('=');
        if (eq < 0) { errors.push(`line ${n}: missing '='`); return; }
        const key = line.slice(0, eq).trim().toLowerCase(), value = line.slice(eq + 1).trim();
        if (!current) { errors.push(`line ${n}: '${key}' is outside an entry section`); return; }
        if (!['file', 'axis', 'palette'].includes(key)) {
            errors.push(`line ${n}: unknown field "${key}"`);
        } else if (current[key] !== undefined) {
            errors.push(`line ${n}: duplicate ${key} field`);
        } else if (key === 'file') {
            if (!value) errors.push(`line ${n}: file value is empty`);
            else current.file = value;
        } else {
            const values = pair(value);
            if (!values) errors.push(`line ${n}: bad ${key} "${value}"`);
            else current[key] = key === 'axis' ? { x: values[0], y: values[1] } : { group: values[0], index: values[1] };
        }
    });
    finish();
    return { entries, errors };
}

function write(entries) {
    function checked(value) {
        const result = integer(value);
        if (result === null) throw new Error('Manifest coordinates and IDs must be signed 32-bit integers.');
        return result;
    }
    return HEADER + entries.map(entry => {
        if (!/^[^\s\[\]\r\n]+$/.test(entry.type || '')) throw new Error('Manifest entry type must be one word.');
        if (typeof entry.file !== 'string' || !entry.file.trim() || /[\r\n]/.test(entry.file) || entry.file !== entry.file.trim()) {
            throw new Error('Manifest file must be a non-empty single-line path without outer whitespace.');
        }
        const lines = [`[${entry.type} ${checked(entry.group)},${checked(entry.index)}]`, `file = ${entry.file}`];
        if (entry.axis) lines.push(`axis = ${checked(entry.axis.x)},${checked(entry.axis.y)}`);
        if (entry.palette) lines.push(`palette = ${checked(entry.palette.group)},${checked(entry.palette.index)}`);
        return lines.join('\n') + '\n\n';
    }).join('');
}

module.exports = { read, write };
