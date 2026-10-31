'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../src/snd_viewer.js'), 'utf8');
assert(source.includes("if (message.type === 'delete')"),'SND direct delete host route must exist');
assert(source.includes("require('./snd_direct_edit').deleteSoundsFromSnd"),'SND delete must rebuild the current archive directly');
assert(source.includes("trackWrite(filename,bytes"),'SND delete must use viewer-owned transactional history');
assert(source.includes("require('./snd_browser').refresh(filename)"),'SND delete must refresh the existing browser in place');
assert(source.includes("if (message.type === 'replace')"),'WAV source replacement remains a reviewed manifest operation');
console.log('SND delete is direct and history-backed; WAV replacement remains manifest-reviewed');
