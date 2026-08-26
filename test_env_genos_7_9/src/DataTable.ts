// DataTable.ts - composant de table de données virtuel (tri + filtres + fenêtrage).
// Version de départ : naïve, non optimisée.

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

export class DataTable {
  private rows: Row[] = [];
  private viewportHeight = 30;

  public load(rows: Row[]): void {
    this.rows = rows;
  }

  // Tri par comparaison générique à chaque appel, sans index.
  public sort(spec: SortSpec): Row[] {
    const sorted = this.rows.slice();
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = 0; j < sorted.length - 1 - i; j += 1) {
        const a = sorted[j][spec.column];
        const b = sorted[j + 1][spec.column];
        let cmp = 0;
        if (typeof a === 'number' && typeof b === 'number') {
          if (a < b) { cmp = -1; }
          if (a > b) { cmp = 1; }
        } else {
          const sa = String(a);
          const sb = String(b);
          if (sa < sb) { cmp = -1; }
          if (sa > sb) { cmp = 1; }
        }
        if ((spec.direction === 'asc' && cmp > 0) || (spec.direction === 'desc' && cmp < 0)) {
          const tmp = sorted[j];
          sorted[j] = sorted[j + 1];
          sorted[j + 1] = tmp;
        }
      }
    }
    this.rows = sorted;
    return sorted;
  }

  // Filtre : reconstruit un tableau à chaque caractère tapé, sur toutes les colonnes.
  public filter(query: string): Row[] {
    const result: Row[] = [];
    const q = query.toLowerCase();
    for (let i = 0; i < this.rows.length; i += 1) {
      const r = this.rows[i];
      const haystack = r.id.toString() + r.name.toLowerCase() + r.category.toLowerCase() + r.score.toString();
      if (haystack.indexOf(q) !== -1) {
        result.push(r);
      }
    }
    return result;
  }

  // Rendu fenêtré : renvoie les lignes visibles.
  public render(offset: number): { visible: Row[]; total: number } {
    const start = Math.max(0, offset);
    const end = Math.min(this.rows.length, offset + this.viewportHeight);
    const visible: Row[] = [];
    for (let i = start; i < end; i += 1) {
      visible.push(this.rows[i]);
    }
    return { visible, total: this.rows.length };
  }
}
