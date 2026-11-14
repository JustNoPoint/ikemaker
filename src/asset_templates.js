'use strict';

function blankSff(version = '2.1') {
  // Every SFF v2 header is 512 bytes (offset 64 is the TDATA length). Version
  // and compatible-version bytes match Elecbyte's: v2.01 = 00 01 00 02.
  const buffer = Buffer.alloc(512); buffer.write('ElecbyteSpr\0', 0, 'latin1');
  const bytes = version === '2.0' ? [0, 0, 0, 2] : [0, 1, 0, 2];
  Buffer.from(bytes).copy(buffer, 12); Buffer.from(bytes).copy(buffer, 24);
  buffer.writeUInt32LE(512, 36); buffer.writeUInt32LE(0, 40); buffer.writeUInt32LE(512, 44); buffer.writeUInt32LE(0, 48); buffer.writeUInt32LE(512, 52); buffer.writeUInt32LE(512, 60);
  return buffer;
}

function blankSnd() {
  const buffer = Buffer.alloc(24); buffer.write('ElecbyteSnd\0', 0, 'binary'); buffer.writeUInt16LE(1, 12); buffer.writeUInt16LE(0, 14); return buffer;
}

module.exports = { blankSff, blankSnd };
