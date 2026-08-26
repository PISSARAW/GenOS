// DataTable_balanced.ts - proposition de Worker_Balanced (génome par défaut).
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
  private readonly viewportHeight = 30;

  public load(rows: Row[]): void {
    this.rows = rows.slice();
  }

  public sort(spec: SortSpec): Row[] {
    const factor = spec.direction === 'asc' ? 1 : -1;
    const col = spec.column;
    const sorted = this.rows.slice().sort((a, b) => {
      const va = a[col];
      const vb = b[col];
      if (typeof va === 'number' && typeof vb === 'number') { return (va - vb) * factor; }
      return String(va).localeCompare(String(vb)) * factor;
    });
    this.rows = sorted;
    return sorted;
  }

  public filter(query: string): Row[] {
    const q = query.toLowerCase();
    return this.rows.filter((r) => (
      r.name.toLowerCase().includes(q)
      || r.category.toLowerCase().includes(q)
      || String(r.id).includes(q)
      || String(r.score).includes(q)
    ));
  }

  public render(offset: number): { visible: Row[]; total: number } {
    const start = Math.max(0, Math.min(offset, this.rows.length));
    return { visible: this.rows.slice(start, start + this.viewportHeight), total: this.rows.length };
  }
}
