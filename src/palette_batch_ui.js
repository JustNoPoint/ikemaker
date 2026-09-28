'use strict';

function reorderPaletteOptions(select, direction) {
  const items = [...select.options], ordered = direction < 0 ? items : items.reverse();
  for (const option of ordered) {
    if (!option.selected) continue;
    const sibling = direction < 0 ? option.previousElementSibling : option.nextElementSibling;
    if (sibling && !sibling.selected) select.insertBefore(option, direction < 0 ? sibling : sibling.nextElementSibling);
  }
}

function selectedPaletteFiles(select) { return [...select.selectedOptions].map((option) => option.value).filter(Boolean); }

module.exports = { reorderPaletteOptions, selectedPaletteFiles };
