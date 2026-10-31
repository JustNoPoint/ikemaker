'use strict';

const SCHEMA = 'ikemaker.authoring-navigation';
const VERSION = 1;
const MODES = Object.freeze(['tabs', 'list', 'cards']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function cloneData(value, path = 'value') {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.map((child, index) => cloneData(child, `${path}[${index}]`));
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${path} must contain only plain serializable data.`);
  }
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    if (typeof child === 'function' || typeof child === 'symbol' || typeof child === 'bigint') {
      throw new TypeError(`${path}.${key} must be serializable.`);
    }
    result[key] = cloneData(child, `${path}.${key}`);
  }
  return result;
}

function requiredId(value, kind) {
  const id = String(value ?? '').trim();
  if (!id) throw new Error(`${kind} requires a stable id.`);
  return id;
}

function uniqueById(records, kind) {
  const seen = new Set();
  return (records || []).map((record) => {
    const copy = cloneData(record, kind), id = requiredId(copy.id, kind);
    if (seen.has(id)) throw new Error(`Duplicate ${kind} id: ${id}`);
    seen.add(id);
    return { ...copy, id };
  });
}

function normalizeGroup(record, type) {
  const itemIds = [...new Set((record.itemIds || record.items || []).map((id) => requiredId(id, 'Group item')))], result = {
    ...record,
    id: requiredId(record.id, 'Group'),
    label: String(record.label || record.id),
    type,
    itemIds
  };
  delete result.items;
  if (type === 'auto' && result.match !== undefined) result.match = cloneData(result.match, `Group ${result.id} match`);
  return result;
}

function normalizeGroups(options) {
  const supplied = options.groups || [];
  const custom = [...(options.customGroups || []), ...supplied.filter((group) => (group.type || 'custom') === 'custom')].map((group) => normalizeGroup(cloneData(group, 'Group'), 'custom'));
  const automatic = [...(options.autoGroups || []), ...supplied.filter((group) => group.type === 'auto')].map((group) => normalizeGroup(cloneData(group, 'Group'), 'auto'));
  const groups = [...custom, ...automatic], seen = new Set();
  for (const group of groups) {
    if (seen.has(group.id)) throw new Error(`Duplicate group id: ${group.id}`);
    seen.add(group.id);
  }
  return groups;
}

function validItemIds(ids, itemIds) {
  return [...new Set((ids || []).map(String))].filter((id) => itemIds.has(id));
}

function createNavigationState(options = {}) {
  const items = uniqueById(options.items || [], 'Navigation item');
  const itemIds = new Set(items.map((item) => item.id));
  const groups = normalizeGroups(options);
  for (const group of groups) {
    const unknown = group.itemIds.find((id) => !itemIds.has(id));
    if (unknown) throw new Error(`Group ${group.id} references unknown item: ${unknown}`);
  }
  const mode = String(options.mode || 'tabs');
  if (!MODES.includes(mode)) throw new Error(`Unsupported navigation mode: ${mode}`);
  const requestedOrder = validItemIds(options.order, itemIds);
  const order = [...requestedOrder, ...items.map((item) => item.id).filter((id) => !requestedOrder.includes(id))];
  const currentId = options.currentId == null ? (order[0] || null) : requiredId(options.currentId, 'Current item');
  if (currentId !== null && !itemIds.has(currentId)) throw new Error(`Current item does not exist: ${currentId}`);
  const groupIds = new Set(groups.map((group) => group.id));
  const customGroupIds = new Set(groups.filter((group) => group.type === 'custom').map((group) => group.id));
  const state = {
    schema: SCHEMA,
    version: VERSION,
    mode,
    items,
    groups,
    pinned: validItemIds(options.pinned, itemIds),
    collapsedGroups: [...new Set((options.collapsedGroups || []).map(String))].filter((id) => groupIds.has(id)),
    collapsedHandIds: [...new Set((options.collapsedHandIds || []).map(String))].filter((id) => customGroupIds.has(id)),
    order,
    currentId,
    filter: cloneData(options.filter ?? null, 'Filter'),
    search: String(options.search || '')
  };
  return deepFreeze(state);
}

function matchesDescriptor(item, descriptor) {
  if (!descriptor || !Object.keys(descriptor).length) return true;
  return Object.entries(descriptor).every(([key, expected]) => {
    const actual = item[key];
    return Array.isArray(expected) ? expected.includes(actual) : Array.isArray(actual) ? actual.includes(expected) : actual === expected;
  });
}

function itemGroupId(item, groups) {
  for (const group of groups.filter((candidate) => candidate.type === 'custom')) {
    if (group.itemIds.includes(item.id)) return group.id;
  }
  if (item.groupId && groups.some((group) => group.id === item.groupId)) return item.groupId;
  for (const group of groups.filter((candidate) => candidate.type === 'auto')) {
    if (group.itemIds.includes(item.id) || (group.match && Object.keys(group.match).length && matchesDescriptor(item, group.match))) return group.id;
  }
  return null;
}

function matchesFilter(item, groupId, filter, pinned) {
  if (!filter) return true;
  if (typeof filter === 'string') return groupId === filter || item.kind === filter || item.type === filter;
  if (Array.isArray(filter)) return filter.includes(item.id);
  if (filter.pinned === true && !pinned) return false;
  if (filter.pinned === false && pinned) return false;
  if (filter.groupId !== undefined && groupId !== filter.groupId) return false;
  if (filter.ids && !filter.ids.map(String).includes(item.id)) return false;
  if (filter.kinds && !filter.kinds.includes(item.kind)) return false;
  if (filter.types && !filter.types.includes(item.type)) return false;
  if (filter.match && !matchesDescriptor(item, filter.match)) return false;
  return true;
}

function matchesSearch(item, search) {
  const query = String(search || '').trim().toLocaleLowerCase();
  if (!query) return true;
  const searchable = [item.id, item.label, item.title, item.description, ...(item.keywords || [])]
    .filter((value) => value !== undefined && value !== null).join(' ').toLocaleLowerCase();
  return query.split(/\s+/).every((term) => searchable.includes(term));
}

function projectNavigation(state) {
  const canonical = createNavigationState(state), pinned = new Set(canonical.pinned), collapsed = new Set(canonical.collapsedGroups), collapsedHands = new Set(canonical.collapsedHandIds);
  const rank = new Map(canonical.order.map((id, index) => [id, index]));
  const grouped = canonical.items.map((item) => ({ item, groupId: itemGroupId(item, canonical.groups) }));
  const visibleEntries = grouped.filter(({ item, groupId }) => !collapsed.has(groupId) && matchesFilter(item, groupId, canonical.filter, pinned.has(item.id)) && matchesSearch(item, canonical.search))
    .sort((left, right) => Number(pinned.has(right.item.id)) - Number(pinned.has(left.item.id)) || rank.get(left.item.id) - rank.get(right.item.id));
  const visibleItems = visibleEntries.map(({ item }) => item);
  const currentId = visibleItems.some((item) => item.id === canonical.currentId) ? canonical.currentId : (visibleItems[0]?.id || null);
  const groupModels = canonical.groups.map((group) => ({
    id: group.id,
    label: group.label,
    type: group.type,
    collapsed: group.type === 'custom' ? collapsedHands.has(group.id) : collapsed.has(group.id),
    expanded: group.type !== 'custom' || !collapsedHands.has(group.id) || group.itemIds.includes(currentId),
    itemIds: visibleEntries.filter((entry) => entry.groupId === group.id).map((entry) => entry.item.id)
  }));
  const ungrouped = visibleEntries.filter((entry) => entry.groupId === null).map((entry) => entry.item.id);
  if (ungrouped.length) groupModels.push({ id: null, label: 'Ungrouped', type: 'automatic', collapsed: false, itemIds: ungrouped });
  const cards = visibleItems.map((item) => deepFreeze({ itemId: item.id }));
  const tabs = visibleItems, list = visibleItems;
  return deepFreeze({
    mode: canonical.mode,
    items: canonical.items,
    visibleItems,
    visibleCount: visibleItems.length,
    currentId,
    groups: groupModels,
    tabs,
    list,
    cards,
    rendered: canonical.mode === 'tabs' ? tabs : canonical.mode === 'list' ? list : cards,
    slider: tabSliderModel(canonical, visibleItems, currentId)
  });
}

function tabSliderModel(state, visibleItems, selectedId) {
  if (!visibleItems) {
    const projected = projectNavigation(state);
    return projected.slider;
  }
  const count = visibleItems.length;
  if (!count) return deepFreeze({ empty: true, single: false, min: 0, max: 0, value: 0, index: -1, title: '0 of 0', previousDisabled: true, nextDisabled: true });
  const index = Math.max(0, visibleItems.findIndex((item) => item.id === selectedId));
  const item = visibleItems[index], itemTitle = String(item.title || item.label || item.id);
  return deepFreeze({ empty: false, single: count === 1, min: 1, max: count, value: index + 1, index, title: `${index + 1} of ${count} · ${itemTitle}`, previousDisabled: index === 0, nextDisabled: index === count - 1 });
}

function resolveDestinationKey(orderedIds, currentId, key, modifiers = {}) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0 || orderedIds.length > 512) return null;
  if (modifiers.altKey || modifiers.ctrlKey || modifiers.metaKey || modifiers.shiftKey) return null;
  const ids = orderedIds.map(String), current = ids.indexOf(String(currentId));
  if (current < 0) return null;
  let destination = current;
  if (key === 'ArrowLeft') destination = Math.max(0, current - 1);
  else if (key === 'ArrowRight') destination = Math.min(ids.length - 1, current + 1);
  else if (key === 'Home') destination = 0;
  else if (key === 'End') destination = ids.length - 1;
  else if (key === 'PageUp') destination = Math.max(0, current - 5);
  else if (key === 'PageDown') destination = Math.min(ids.length - 1, current + 5);
  else return null;
  return destination === current ? null : ids[destination];
}

function handleDestinationKey(orderedIds, currentId, event = {}, effects = {}, resolver = resolveDestinationKey) {
  const ids = Array.isArray(orderedIds) ? orderedIds.map(String) : [];
  if (!ids.length || ids.length > 512) return false;
  const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
  let destination = null;
  if (!modified && (event.key === 'Enter' || event.key === ' ')) {
    destination = ids.includes(String(currentId)) ? String(currentId) : null;
  } else {
    destination = resolver(ids, currentId, event.key, event);
  }
  if (!destination) return false;
  effects.preventDefault?.();
  effects.rememberSourceView?.();
  effects.activate?.(destination);
  return true;
}

function applyDestinationVisibility(buttons, revealId, focusId) {
  const destinations = Array.isArray(buttons) ? buttons : [...(buttons || [])];
  const reveal = destinations.find((item) => String(item?.dataset?.id ?? '') === String(revealId ?? ''));
  if (!reveal) return Object.freeze({ revealed:false, focused:false });
  reveal.scrollIntoView?.({ block:'nearest', inline:'nearest' });
  const shouldFocus = focusId !== undefined && focusId !== null && String(focusId) !== '' && String(focusId) === String(revealId);
  if (shouldFocus) {
    destinations.forEach((item) => { item.tabIndex = -1; });
    reveal.tabIndex = 0;
    reveal.focus?.({ preventScroll:true });
  }
  return Object.freeze({ revealed:true, focused:shouldFocus });
}

function replaceState(state, changes) {
  return createNavigationState({ ...state, ...changes });
}

function reduceNavigation(state, action = {}) {
  const current = createNavigationState(state), type = String(action.type || '');
  if (type === 'set-mode') return replaceState(current, { mode: action.mode });
  if (type === 'set-search') return replaceState(current, { search: action.search });
  if (type === 'set-filter') return replaceState(current, { filter: action.filter ?? null });
  if (type === 'set-collapsed-hands') return replaceState(current, { collapsedHandIds:action.ids || [] });
  if (type === 'select' || type === 'set-current') return replaceState(current, { currentId: action.id });
  if (type === 'pin' || type === 'unpin' || type === 'toggle-pin') {
    const id = requiredId(action.id, 'Pinned item');
    if (!current.items.some((item) => item.id === id)) throw new Error(`Pinned item does not exist: ${id}`);
    const pins = new Set(current.pinned), shouldPin = type === 'pin' || (type === 'toggle-pin' && !pins.has(id));
    if (shouldPin) pins.add(id); else pins.delete(id);
    return replaceState(current, { pinned: [...pins] });
  }
  if (['collapse-group', 'expand-group', 'toggle-group'].includes(type)) {
    const id = requiredId(action.id, 'Group');
    if (!current.groups.some((group) => group.id === id)) throw new Error(`Group does not exist: ${id}`);
    const collapsed = new Set(current.collapsedGroups), shouldCollapse = type === 'collapse-group' || (type === 'toggle-group' && !collapsed.has(id));
    if (shouldCollapse) collapsed.add(id); else collapsed.delete(id);
    return replaceState(current, { collapsedGroups: [...collapsed] });
  }
  if (type === 'set-order') return replaceState(current, { order: action.order });
  if (type === 'move') {
    const id = requiredId(action.id, 'Navigation item'), beforeId = action.beforeId == null ? null : requiredId(action.beforeId, 'Navigation item');
    if (!current.order.includes(id) || (beforeId !== null && !current.order.includes(beforeId))) throw new Error('Cannot reorder an unknown navigation item.');
    const order = current.order.filter((candidate) => candidate !== id), index = beforeId === null ? order.length : order.indexOf(beforeId);
    order.splice(index, 0, id);
    return replaceState(current, { order });
  }
  if (type === 'previous' || type === 'next' || type === 'select-index' || type === 'set-slider') {
    const projection = projectNavigation(current), count = projection.visibleItems.length;
    if (!count) return current;
    const currentIndex = projection.visibleItems.findIndex((item) => item.id === projection.currentId);
    const wanted = type === 'previous' ? currentIndex - 1 : type === 'next' ? currentIndex + 1 : Number(action.index ?? Number(action.value) - 1);
    if (!Number.isInteger(wanted) || wanted < 0 || wanted >= count) return current;
    return replaceState(current, { currentId: projection.visibleItems[wanted].id });
  }
  throw new Error(`Unsupported navigation action: ${type}`);
}

function serializeNavigationState(state) {
  const canonical = createNavigationState(state);
  return JSON.stringify(canonical);
}

function deserializeNavigationState(serialized) {
  const value = typeof serialized === 'string' ? JSON.parse(serialized) : cloneData(serialized, 'Serialized navigation state');
  if (value?.schema !== SCHEMA || value?.version !== VERSION) throw new Error('Unsupported authoring navigation state.');
  return createNavigationState(value);
}

module.exports = {
  SCHEMA, VERSION, MODES, deepFreeze, createNavigationState, createAuthoringNavigationModel: createNavigationState,
  projectNavigation, navigationView: projectNavigation, tabSliderModel, reduceNavigation, updateNavigation: reduceNavigation,
  resolveDestinationKey, handleDestinationKey, applyDestinationVisibility, serializeNavigationState, deserializeNavigationState
};
