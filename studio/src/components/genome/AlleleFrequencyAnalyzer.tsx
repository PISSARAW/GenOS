import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { api } from '../../api/client';

interface GeneFrequencyItem {
  id: string;
  geneName: string;
  category: string;
  frequencyPct: number | null;
  correlationFallbackPct: number | null;
  winCorrelation: number | null;
  status: 'dominant_beneficial' | 'neutral' | 'lethal';
}

type SortKey = 'frequency' | 'winCorrelation';
type SortDir = 'asc' | 'desc';

export const AlleleFrequencyAnalyzer: React.FC = () => {
  const [genes, setGenes] = useState<GeneFrequencyItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('frequency');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data: any = await api.getAlleles();
      const records = Array.isArray(data?.geneFrequencyMatrix) ? data.geneFrequencyMatrix : [];
      setGenes(records.map((gene: any) => {
        const recordedFrequency = gene.frequencyPct == null ? null : Number(gene.frequencyPct);
        const correlationFallback = recordedFrequency === null && gene.successCorrelation != null
          ? Number(String(gene.successCorrelation).replace('%', ''))
          : null;
        return {
          id: gene.alleleId,
          geneName: gene.name,
          category: gene.category || 'Recorded',
          frequencyPct: recordedFrequency,
          correlationFallbackPct: correlationFallback,
          winCorrelation: gene.winCorrelation == null ? null : Number(gene.winCorrelation),
          status: gene.status === 'LETHAL' ? 'lethal' : gene.status === 'BENEFICIAL' ? 'dominant_beneficial' : 'neutral'
        };
      }));
    } catch (e: any) {
      setGenes([]);
      setError(e.message || 'Failed to load allele frequencies.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const categories = useMemo(() => Array.from(new Set(genes.map((gene) => gene.category))).sort(), [genes]);

  const hasRecordedFrequency = useMemo(() => genes.some((gene) => gene.frequencyPct !== null), [genes]);

  const frequencyColumnLabel = hasRecordedFrequency ? 'Fleet Frequency' : genes.some((gene) => gene.correlationFallbackPct !== null) ? 'Success Correlation' : 'Fleet Frequency';

  const effectiveFrequency = (gene: GeneFrequencyItem): number | null =>
    gene.frequencyPct !== null ? gene.frequencyPct : gene.correlationFallbackPct;

  const visibleGenes = useMemo(() => {
    const filtered = categoryFilter === 'all' ? genes : genes.filter((gene) => gene.category === categoryFilter);
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === 'frequency') {
        const av = effectiveFrequency(a);
        const bv = effectiveFrequency(b);
        return (av ?? -Infinity) - (bv ?? -Infinity);
      }
      return (a.winCorrelation ?? -Infinity) - (b.winCorrelation ?? -Infinity);
    });
    if (sortDir === 'desc') sorted.reverse();
    return sorted;
  }, [genes, categoryFilter, sortKey, sortDir]);

  const handleSortClick = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>

      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <BarChart3 size={14} color="var(--accent-blue)" /> Allele & Gene Frequency Analyzer (Heuristic Genomic Mining)
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ padding: '4px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <button onClick={load} disabled={isLoading} className="gh-btn" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
            <RefreshCw size={12} /> {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Backend records only</span>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: 'rgba(248, 81, 73, 0.1)', borderBottom: '1px solid var(--danger)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>Failed to load allele data: {error}</span>
          <button onClick={load} className="gh-btn" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Retry</button>
        </div>
      )}

      <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px' }}>Prompt Gene / Heuristic</th>
              <th style={{ padding: '10px 12px' }}>Category</th>
              <th onClick={() => handleSortClick('frequency')} style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }}>
                {frequencyColumnLabel}{sortIndicator('frequency')}
              </th>
              <th onClick={() => handleSortClick('winCorrelation')} style={{ padding: '10px 12px', cursor: 'pointer', userSelect: 'none' }}>
                Win Correlation{sortIndicator('winCorrelation')}
              </th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Genomic Status</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && !error && visibleGenes.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', color: 'var(--text-secondary)', textAlign: 'center' }}>No genomic data recorded.</td></tr>}
            {visibleGenes.map((gene, idx) => {
              const isBeneficial = gene.status === 'dominant_beneficial';
              const isLethal = gene.status === 'lethal';
              const displayedFrequency = effectiveFrequency(gene);

              return (
                <tr key={gene.id} style={{ borderBottom: idx < visibleGenes.length - 1 ? '1px solid var(--panel-border)' : 'none' }} className="hover-bg-gray">
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {gene.geneName}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{gene.category}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '80px', height: '6px', background: 'var(--bg-main)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${displayedFrequency || 0}%`, height: '100%', background: isLethal ? 'var(--danger)' : isBeneficial ? 'var(--success)' : 'var(--accent-blue)' }} />
                      </div>
                      <span
                        style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}
                        title={gene.frequencyPct === null && gene.correlationFallbackPct !== null ? 'No fleet frequency recorded; value derived from success correlation.' : undefined}
                      >
                        {displayedFrequency === null ? '—' : `${displayedFrequency}%${gene.frequencyPct === null ? '~' : ''}`}
                      </span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: gene.winCorrelation !== null && gene.winCorrelation > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>
                    {gene.winCorrelation === null ? '—' : gene.winCorrelation > 0 ? `+${gene.winCorrelation}` : gene.winCorrelation}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {isBeneficial && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid var(--success)', color: 'var(--success)', background: 'rgba(35, 134, 54, 0.1)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>
                        <TrendingUp size={10} /> Dominant Beneficial
                      </span>
                    )}
                    {isLethal && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid var(--danger)', color: 'var(--danger)', background: 'rgba(248, 81, 73, 0.1)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>
                        <TrendingDown size={10} /> Lethal Gene
                      </span>
                    )}
                    {!isBeneficial && !isLethal && (
                      <span style={{ border: '1px solid var(--panel-border)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem' }}>
                        Neutral Variant
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
};
