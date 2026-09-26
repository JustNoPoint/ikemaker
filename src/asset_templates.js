'use strict';

function blankSff(version = '2.1') {
  const buffer = Buffer.alloc(64); buffer.write('ElecbyteSpr\0', 0, 'latin1');
  buffer[12] = 0; buffer[13] = 0; buffer[14] = version === '2.0' ? 0 : 1; buffer[15] = 2;
  buffer.writeUInt32LE(64, 36); buffer.writeUInt32LE(0, 40); buffer.writeUInt32LE(64, 44); buffer.writeUInt32LE(0, 48); buffer.writeUInt32LE(64, 52); buffer.writeUInt32LE(64, 60);
  return buffer;
}

function blankSnd() {
  const buffer = Buffer.alloc(24); buffer.write('ElecbyteSnd\0', 0, 'binary'); buffer.writeUInt16LE(1, 12); buffer.writeUInt16LE(0, 14); return buffer;
}

module.exports = { blankSff, blankSnd };
