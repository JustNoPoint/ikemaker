'use strict';
const path = require('node:path');

function pathKey(filename, platform = process.platform) {
    if (!filename) return '';
    const resolved = (platform === 'win32' ? path.win32 : path.posix).resolve(filename);
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function entityId(owner) {
    const definitions = new Map();
    for (const filename of owner?.session?.ownerDefs || []) {
        if (typeof filename === 'string' && path.isAbsolute(filename) && path.extname(filename).toLowerCase() === '.def')
            definitions.set(pathKey(filename), path.resolve(filename));
    }
    if (definitions.size === 1) return definitions.values().next().value;
}

module.exports = { entityId, pathKey };
