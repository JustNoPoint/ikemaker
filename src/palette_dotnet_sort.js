'use strict';

// .NET ArraySortHelper introsort order matters when median-cut channels tie.
// A stable JS sort produces different quantization boxes from Media Editor.
function sort(values, compare) {
    const swap = (a, b) => { [values[a], values[b]] = [values[b], values[a]]; };
    const swapIfGreater = (a, b) => { if (a !== b && compare(values[a], values[b]) > 0) swap(a, b); };
    function insertion(lo, hi) {
        for (let i = lo; i < hi; i++) {
            const value = values[i + 1];
            let j = i;
            while (j >= lo && compare(value, values[j]) < 0) { values[j + 1] = values[j]; j--; }
            values[j + 1] = value;
        }
    }
    function downHeap(i, n, lo) {
        const value = values[lo + i - 1];
        while (i <= Math.floor(n / 2)) {
            let child = 2 * i;
            if (child < n && compare(values[lo + child - 1], values[lo + child]) < 0) child++;
            if (compare(value, values[lo + child - 1]) >= 0) break;
            values[lo + i - 1] = values[lo + child - 1];
            i = child;
        }
        values[lo + i - 1] = value;
    }
    function heap(lo, hi) {
        const n = hi - lo + 1;
        for (let i = Math.floor(n / 2); i >= 1; i--) downHeap(i, n, lo);
        for (let i = n; i > 1; i--) { swap(lo, lo + i - 1); downHeap(1, i - 1, lo); }
    }
    function partition(lo, hi) {
        const middle = lo + Math.floor((hi - lo) / 2);
        swapIfGreater(lo, middle); swapIfGreater(lo, hi); swapIfGreater(middle, hi);
        const pivot = values[middle];
        swap(middle, hi - 1);
        let left = lo, right = hi - 1;
        while (left < right) {
            do { left++; } while (compare(values[left], pivot) < 0);
            do { right--; } while (compare(pivot, values[right]) < 0);
            if (left >= right) break;
            swap(left, right);
        }
        if (left !== hi - 1) swap(left, hi - 1);
        return left;
    }
    function intro(lo, hi, depth) {
        while (hi > lo) {
            const size = hi - lo + 1;
            if (size <= 16) {
                if (size === 2) swapIfGreater(lo, hi);
                else if (size === 3) { swapIfGreater(lo, hi - 1); swapIfGreater(lo, hi); swapIfGreater(hi - 1, hi); }
                else insertion(lo, hi);
                return;
            }
            if (!depth) { heap(lo, hi); return; }
            depth--;
            const pivot = partition(lo, hi);
            intro(pivot + 1, hi, depth);
            hi = pivot - 1;
        }
    }
    if (values.length > 1) intro(0, values.length - 1, 2 * (Math.floor(Math.log2(values.length)) + 1));
    return values;
}

module.exports = { sort };
