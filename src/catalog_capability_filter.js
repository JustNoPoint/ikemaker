'use strict';

function enabledCapabilityIds(snapshot = {}) {
  if (snapshot.enabledCapabilities instanceof Set) return snapshot.enabledCapabilities;
  if (Array.isArray(snapshot.enabledCapabilities)) return new Set(snapshot.enabledCapabilities.map((value) => String(value).toLowerCase()));
  const decisions = snapshot.capabilities && typeof snapshot.capabilities === 'object' ? snapshot.capabilities : {};
  return new Set(Object.entries(decisions).filter(([, value]) => value === true || value?.enabled === true).map(([id]) => id.toLowerCase()));
}

function entryAvailable(entry, snapshot = {}) {
  const capabilityId = String(entry?.capabilityId || '').trim().toLowerCase();
  return !capabilityId || enabledCapabilityIds(snapshot).has(capabilityId);
}

function filterEntry(entry, snapshot = {}) {
  if (!entryAvailable(entry, snapshot)) return null;
  let result = entry;
  const augmentations = (Array.isArray(entry?.capabilityAugmentations) ? entry.capabilityAugmentations : []).filter((item) => entryAvailable(item, snapshot));
  if (augmentations.length) {
    result = { ...entry };
    for (const augmentation of augmentations) {
      if (augmentation.descriptionAppend) result.description = `${result.description || ''}${result.description ? ' ' : ''}${augmentation.descriptionAppend}`;
      if (augmentation.detailAppend) result.detail = `${result.detail || ''}${result.detail ? ' ' : ''}${augmentation.detailAppend}`;
      if (augmentation.signature) result.signature = augmentation.signature;
      if (augmentation.arguments) result.arguments = augmentation.arguments;
      if (augmentation.returnType) result.returnType = augmentation.returnType;
      if (augmentation.placeholder) result.placeholder = augmentation.placeholder;
    }
  }
  if (Array.isArray(entry?.params)) {
    const params = entry.params.map((parameter) => filterEntry(parameter, snapshot)).filter(Boolean);
    result = params.length === entry.params.length && params.every((parameter,index)=>parameter===entry.params[index]) ? result : { ...result, params };
  }
  if (Array.isArray(entry?.argumentSlots)) {
    const argumentSlots=entry.argumentSlots.map(slot=>{
      if(!entryAvailable(slot,snapshot))return null;
      if(!Array.isArray(slot?.choices))return slot;
      const choices=slot.choices.map(choice=>filterEntry(choice,snapshot)).filter(Boolean);
      return choices.length===slot.choices.length&&choices.every((choice,index)=>choice===slot.choices[index])?slot:{...slot,choices};
    }).filter(Boolean);
    if(argumentSlots.length!==entry.argumentSlots.length||argumentSlots.some((slot,index)=>slot!==entry.argumentSlots[index]))result={...result,argumentSlots};
  }
  return result;
}

function filterAvailable(entries, snapshot = {}) {
  return (Array.isArray(entries) ? entries : []).map((entry) => filterEntry(entry, snapshot)).filter(Boolean);
}

module.exports = { enabledCapabilityIds, entryAvailable, filterEntry, filterAvailable };
