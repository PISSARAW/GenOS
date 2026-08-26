"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTable = void 0;
class DataTable {
    constructor() {
        this.rows = [];
        this.viewportHeight = 30;
    }
    load(rows) {
        this.rows = rows.slice();
    }
    sort(spec) {
        const factor = spec.direction === 'asc' ? 1 : -1;
        const col = spec.column;
        const sorted = this.rows.slice().sort((a, b) => {
            const va = a[col];
            const vb = b[col];
            if (typeof va === 'number' && typeof vb === 'number') {
                return (va - vb) * factor;
            }
            return String(va).localeCompare(String(vb)) * factor;
        });
        this.rows = sorted;
        return sorted;
    }
    filter(query) {
        const q = query.toLowerCase();
        return this.rows.filter((r) => (r.name.toLowerCase().includes(q)
            || r.category.toLowerCase().includes(q)
            || String(r.id).includes(q)
            || String(r.score).includes(q)));
    }
    render(offset) {
        const start = Math.max(0, Math.min(offset, this.rows.length));
        return { visible: this.rows.slice(start, start + this.viewportHeight), total: this.rows.length };
    }
}
exports.DataTable = DataTable;
