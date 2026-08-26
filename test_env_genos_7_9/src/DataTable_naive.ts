// DataTable_naive.ts - Méthode A : prompt "optimise pour la vitesse maximale".
// Résultat : rapide mais lourd (index multiples, caches, précomputation systématique).

export interface Row {
  id: number;
  name: string;
  category: string;
  score: number;
}

export interface SortSpec {
  column: keyof Row;
  direction: 'asc' | 'desc';
}

type Comparator = (a: Row, b: Row) => number;

export class DataTable {
  private rows: Row[] = [];
  private viewportHeight = 30;

  // Caches et index précomputés pour CHAQUE colonne, même ceux jamais utilisés.
  private numericIndexes = new Map<keyof Row, Map<number, Row[]>>();
  private stringIndexes = new Map<keyof Row, Map<string, Row[]>>();
  private sortedCache = new Map<string, Row[]>();
  private filterCache = new Map<string, Row[]>();
  private cacheHits = 0;
  private cacheMisses = 0;

  public load(rows: Row[]): void {
    this.rows = rows;
    this.numericIndexes.clear();
    this.stringIndexes.clear();
    this.sortedCache.clear();
    this.filterCache.clear();
    // Précomputation agressive au chargement : 4 index de plus qu'il n'en faut.
    const columns: (keyof Row)[] = ['id', 'name', 'category', 'score'];
    for (const col of columns) {
      if (typeof rows[0][col] === 'number') {
        this.buildNumericIndex(col);
      } else {
        this.buildStringIndex(col);
      }
    }
  }

  private buildNumericIndex(col: keyof Row): void {
    const index = new Map<number, Row[]>();
    for (const row of this.rows) {
      const key = row[col] as number;
      const bucket = index.get(key);
      if (bucket) { bucket.push(row); } else { index.set(key, [row]); }
    }
    this.numericIndexes.set(col, index);
  }

  private buildStringIndex(col: keyof Row): void {
    const index = new Map<string, Row[]>();
    for (const row of this.rows) {
      const key = String(row[col]);
      const bucket = index.get(key);
      if (bucket) { bucket.push(row); } else { index.set(key, [row]); }
    }
    this.stringIndexes.set(col, index);
  }

  public sort(spec: SortSpec): Row[] {
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
    this.sortedCache.set(`${String(spec.column)}:${spec.direction === 'asc' ? 'desc' : 'asc'}`,
      sorted.slice().reverse());
    return sorted;
  }

  private makeComparator(column: keyof Row, direction: 'asc' | 'desc'): Comparator {
    const factor = direction === 'asc' ? 1 : -1;
    return (a: Row, b: Row) => {
      const va = a[column];
      const vb = b[column];
      if (typeof va === 'number' && typeof vb === 'number') { return (va - vb) * factor; }
      return String(va).localeCompare(String(vb)) * factor;
    };
  }

  public filter(query: string): Row[] {
    const cached = this.filterCache.get(query);
    if (cached) {
      this.cacheHits += 1;
      return cached;
    }
    this.cacheMisses += 1;
    // Index de suffixes précomputés pour accélérer les sous-chaînes (lourd).
    const q = query.toLowerCase();
    const result = this.rows.filter((r) => (
      r.name.toLowerCase().includes(q)
      || r.category.toLowerCase().includes(q)
      || String(r.id).includes(q)
      || String(r.score).includes(q)
    ));
    this.filterCache.set(query, result);
    return result;
  }

  public render(offset: number): { visible: Row[]; total: number } {
    const start = Math.max(0, offset);
    const end = Math.min(this.rows.length, offset + this.viewportHeight);
    return { visible: this.rows.slice(start, end), total: this.rows.length };
  }

  public cacheStats(): { hits: number; misses: number } {
    return { hits: this.cacheHits, misses: this.cacheMisses };
  }
}
