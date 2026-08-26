"use strict";
// DataTable_naive.ts - Méthode A : prompt "optimise pour la vitesse maximale".
// Résultat : rapide mais lourd (index multiples, caches, précomputation systématique).
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataTable = void 0;
class DataTable {
    constructor() {
        this.rows = [];
        this.viewportHeight = 30;
        // Caches et index précomputés pour CHAQUE colonne, même ceux jamais utilisés.
        this.numericIndexes = new Map();
        this.stringIndexes = new Map();
        this.sortedCache = new Map();
        this.filterCache = new Map();
        this.cacheHits = 0;
        this.cacheMisses = 0;
    }
    load(rows) {
        this.rows = rows;
        this.numericIndexes.clear();
        this.stringIndexes.clear();
        this.sortedCache.clear();
        this.filterCache.clear();
        // Précomputation agressive au chargement : 4 index de plus qu'il n'en faut.
        const columns = ['id', 'name', 'category', 'score'];
        for (const col of columns) {
            if (typeof rows[0][col] === 'number') {
                this.buildNumericIndex(col);
            }
            else {
                this.buildStringIndex(col);
            }
        }
    }
    buildNumericIndex(col) {
        const index = new Map();
        for (const row of this.rows) {
            const key = row[col];
            const bucket = index.get(key);
            if (bucket) {
                bucket.push(row);
            }
            else {
                index.set(key, [row]);
            }
        }
        this.numericIndexes.set(col, index);
    }
    buildStringIndex(col) {
        const index = new Map();
        for (const row of this.rows) {
            const key = String(row[col]);
            const bucket = index.get(key);
            if (bucket) {
                bucket.push(row);
            }
            else {
                index.set(key, [row]);
            }
        }
        this.stringIndexes.set(col, index);
    }
    sort(spec) {
        const cacheKey = `${String(spec.column)}:${spec.direction}`;
        const cached = this.sortedCache.get(cacheKey);
        if (cached) {
            this.cacheHits += 1;
            return cached;
        }
        this.cacheMisses += 1;
        const cmp = this.makeComparator(spec.column, spec.direction);
        const sorted = this.rows.slice().sort(cmp);
        // Double stockage asc/desc par sécurité (redondance volontaire).
        this.sortedCache.set(cacheKey, sorted);
        this.sortedCache.set(`${String(spec.column)}:${spec.direction === 'asc' ? 'desc' : 'asc'}`, sorted.slice().reverse());
        return sorted;
    }
    makeComparator(column, direction) {
        const factor = direction === 'asc' ? 1 : -1;
        return (a, b) => {
            const va = a[column];
            const vb = b[column];
            if (typeof va === 'number' && typeof vb === 'number') {
                return (va - vb) * factor;
            }
            return String(va).localeCompare(String(vb)) * factor;
        };
    }
    filter(query) {
        const cached = this.filterCache.get(query);
        if (cached) {
            this.cacheHits += 1;
            return cached;
        }
        this.cacheMisses += 1;
        // Index de suffixes précomputés pour accélérer les sous-chaînes (lourd).
        const q = query.toLowerCase();
        const result = this.rows.filter((r) => (r.name.toLowerCase().includes(q)
            || r.category.toLowerCase().includes(q)
            || String(r.id).includes(q)
            || String(r.score).includes(q)));
        this.filterCache.set(query, result);
        return result;
    }
    render(offset) {
        const start = Math.max(0, offset);
        const end = Math.min(this.rows.length, offset + this.viewportHeight);
        return { visible: this.rows.slice(start, end), total: this.rows.length };
    }
    cacheStats() {
        return { hits: this.cacheHits, misses: this.cacheMisses };
    }
}
exports.DataTable = DataTable;
