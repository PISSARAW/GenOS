// DataTable_strict.ts - proposition de Worker_Strict (syntax_strictness=0.95 : défense maximale).
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

const VALID_COLUMNS: readonly (keyof Row)[] = ['id', 'name', 'category', 'score'];
const VALID_DIRECTIONS: readonly string[] = ['asc', 'desc'];

function assertValidRows(rows: Row[]): void {
  if (!Array.isArray(rows)) { throw new TypeError('rows must be an array'); }
  rows.forEach((row, i) => {
    if (typeof row.id !== 'number' || !Number.isFinite(row.id)) {
      throw new TypeError(`row ${i}: id must be a finite number`);
    }
    if (typeof row.name !== 'string' || row.name.length === 0) {
      throw new TypeError(`row ${i}: name must be a non-empty string`);
    }
    if (typeof row.category !== 'string') {
      throw new TypeError(`row ${i}: category must be a string`);
    }
    if (typeof row.score !== 'number' || !Number.isFinite(row.score)) {
      throw new TypeError(`row ${i}: score must be a finite number`);
    }
  });
}

export class DataTable {
  private rows: Row[] = [];
  private readonly viewportHeight: number;

  public constructor(viewportHeight?: number) {
    const height = viewportHeight ?? 30;
    if (!Number.isInteger(height) || height <= 0) {
      throw new RangeError('viewportHeight must be a positive integer');
    }
    this.viewportHeight = height;
  }

  public load(rows: Row[]): void {
    assertValidRows(rows);
    this.rows = rows.slice(); // copie défensive
  }

  public sort(spec: SortSpec): Row[] {
    if (!VALID_COLUMNS.includes(spec.column)) {
      throw new RangeError(`invalid sort column: ${String(spec.column)}`);
    }
    if (!VALID_DIRECTIONS.includes(spec.direction)) {
      throw new RangeError(`invalid sort direction: ${spec.direction}`);
    }
    // Copie défensive supplémentaire avant tri (immutabilité garantie pour l'appelant).
    const copy = this.rows.map((r) => ({ ...r }));
    const factor = spec.direction === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      const va = a[spec.column];
      const vb = b[spec.column];
      if (typeof va === 'number' && typeof vb === 'number') { return (va - vb) * factor; }
      return String(va).localeCompare(String(vb)) * factor;
    });
    this.rows = copy;
    return copy.map((r) => ({ ...r })); // troisième copie : la sortie ne peut pas muter l'état
  }

  public filter(query: string): Row[] {
    if (typeof query !== 'string') { throw new TypeError('query must be a string'); }
    if (query.length > 256) { throw new RangeError('query too long'); }
    const q = query.toLowerCase();
    return this.rows.filter((r) => (
      r.name.toLowerCase().includes(q)
      || r.category.toLowerCase().includes(q)
      || String(r.id).includes(q)
      || String(r.score).includes(q)
    )).map((r) => ({ ...r }));
  }

  public render(offset: number): { visible: Row[]; total: number } {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new RangeError('offset must be a non-negative integer');
    }
    const start = Math.min(offset, this.rows.length);
    const end = Math.min(this.rows.length, start + this.viewportHeight);
    const visible: Row[] = [];
    for (let i = start; i < end; i += 1) {
      visible.push({ ...this.rows[i] });
    }
    return { visible, total: this.rows.length };
  }
}
