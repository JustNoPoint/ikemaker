'use strict';

const same = (left, right) => left.every((channel, index) => channel === right[index]);

// Frequency-weighted median cut, following Sff/Quantize.cs. RGB determines
// the split; the resulting RGBA centroid uses integer division.
function reduceGrouped(colors, weights, maximum = 255) {
    if (!Number.isInteger(maximum) || maximum < 1 || maximum > 255 || colors.length !== weights.length) throw new Error('Invalid median-cut limit or weights.');
    function box(points) {
        const low = [255, 255, 255], high = [0, 0, 0];
        let weight = 0;
        for (const point of points) {
            weight += point.weight;
            for (let channel = 0; channel < 3; channel++) {
                low[channel] = Math.min(low[channel], point.color[channel]);
                high[channel] = Math.max(high[channel], point.color[channel]);
            }
        }
        return { points, weight, ranges: high.map((value, channel) => value - low[channel]), priority: high.reduce((value, maximum, channel) => value * (maximum - low[channel] + 1), weight) };
    }
    const points = colors.slice(1).map((color, index) => {
        if (!Number.isFinite(weights[index + 1]) || weights[index + 1] <= 0) throw new Error('Visible colors require positive weights.');
        return { color, weight: weights[index + 1], source: index + 1 };
    });
    const boxes = points.length ? [box(points)] : [];
    while (boxes.length < maximum) {
        let selected = -1, priority = -Infinity;
        boxes.forEach((candidate, index) => {
            if (candidate.points.length > 1 && candidate.priority > priority) { selected = index; priority = candidate.priority; }
        });
        if (selected < 0) break;
        const current = boxes[selected], widest = Math.max(...current.ranges), channel = current.ranges.indexOf(widest);
        require('./palette_dotnet_sort').sort(current.points, (left, right) => left.color[channel] - right.color[channel]);
        let accumulated = 0, split = 0;
        const halfway = Math.floor(current.weight / 2);
        while (split < current.points.length - 1 && accumulated < halfway) accumulated += current.points[split++].weight;
        // A multi-point box always has weight >= 2, so both halves are nonempty.
        boxes[selected] = box(current.points.slice(0, split));
        boxes.push(box(current.points.slice(split)));
    }
    const result = [[...colors[0]]], groups = Array(colors.length).fill(0);
    boxes.forEach((current, index) => {
        result.push([0, 1, 2, 3].map(channel => Math.floor(current.points.reduce((sum, point) => sum + point.color[channel] * point.weight, 0) / current.weight)));
        current.points.forEach(point => { groups[point.source] = index + 1; });
    });
    return { colors: result, groups };
}

function build(sources, fill = null, maximum = 255) {
    if (!sources.length || !sources[0].colors.length) throw new Error('Choose at least one palette with colors.');
    const unique = [], weights = [], lookup = new Map();
    const ids = sources.map(source => {
        const result = Array(Math.min(256, source.colors.length)).fill(-1);
        for (let index = 1; index < result.length; index++) {
            if (source.skip?.[index]) continue;
            const color = source.colors[index], key = color.join(',');
            if (!lookup.has(key)) { lookup.set(key, unique.length); unique.push([...color]); weights.push(0); }
            const id = lookup.get(key);
            weights[id] += Math.max(1, source.weights?.[index] || 0);
            result[index] = id;
        }
        return result;
    });
    if (!unique.length) throw new Error('No colors remain after excluding padding.');
    const reduced = unique.length > maximum;
    const quantized = reduced ? reduceGrouped([[0, 0, 0, 0], ...unique], [0, ...weights], maximum) : { colors: [[0, 0, 0, 0], ...unique], groups: [0, ...unique.map((_, index) => index + 1)] };
    const groupColors = quantized.colors.slice(1), groupOf = quantized.groups.slice(1).map(index => index - 1), groupWeight = groupColors.map(() => 0);
    weights.forEach((weight, index) => { groupWeight[groupOf[index]] += weight; });
    const largest = Math.max(...sources.map(source => Math.min(source.colors.length, 256)));
    let length = largest;
    if (groupColors.length + 1 > length) { length = 2; while (length < groupColors.length + 1) length *= 2; }
    const slots = groupColors.map(() => -1), taken = Array(length).fill(false);
    taken[0] = true;
    ids.forEach(source => source.forEach((id, index) => {
        if (index && id >= 0 && index < length && slots[groupOf[id]] < 0 && !taken[index]) { slots[groupOf[id]] = index; taken[index] = true; }
    }));
    let free = 1;
    slots.map((slot, group) => ({ slot, group })).filter(item => item.slot < 0).sort((left, right) => groupWeight[right.group] - groupWeight[left.group]).forEach(({ group }) => {
        while (taken[free]) free++;
        slots[group] = free; taken[free] = true;
    });
    const colors = Array.from({ length }, (_, index) => [...(index === 0 ? sources[0].colors[0] : fill || sources[0].colors[index] || [0, 0, 0, 255])]);
    groupColors.forEach((color, group) => { colors[slots[group]] = [...color]; });
    const maps = ids.map(source => Array.from({ length: 256 }, (_, index) => index < source.length && source[index] >= 0 ? slots[groupOf[source[index]]] : index));
    return { colors, maps, uniqueColors: unique.length, reduced };
}

function paddingStart(colors) {
    let start = Math.min(256, colors.length);
    const last = colors[start - 1];
    while (start > 1 && same(colors[start - 1], last)) start--;
    return start < Math.min(256, colors.length) - 1 ? start : colors.length;
}

module.exports = { build, reduceGrouped, paddingStart };
