'use strict';

const metadataSorts = { durationSeconds: 'Duration', sampleRate: 'Sample rate', channels: 'Channels', storedSize: 'Stored WAV size', format: 'WAV format', bitsPerSample: 'Bit depth' };

function compareSoundMetadata(a, b, field, direction = 'asc') {
  const av = a[field], bv = b[field];
  const validA = typeof av === 'number' && Number.isFinite(av), validB = typeof bv === 'number' && Number.isFinite(bv);
  if (validA !== validB) return validA ? -1 : 1;
  return (validA ? (av - bv) * (direction === 'desc' ? -1 : 1) : 0) || a.archiveIndex - b.archiveIndex;
}

module.exports = { metadataSorts, compareSoundMetadata };
