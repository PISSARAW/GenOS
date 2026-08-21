import React, { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, CheckCircle2 } from 'lucide-react';
import { api } from '../../api/client';

interface GeneFrequencyItem {
  id: string;
  geneName: string;
  category: string;
  frequencyPct: number | null;
  winCorrelation: number | null;
  status: 'dominant_beneficial' | 'neutral' | 'lethal';
}

export const AlleleFrequencyAnalyzer: React.FC = () => {
  const [genes, setGenes] = useState<GeneFrequencyItem[]>([]);

  useEffect(() => {
    api.getAlleles().then((data: any) => {
      const records = Array.isArray(data?.geneFrequencyMatrix) ? data.geneFrequencyMatrix : [];
      setGenes(records.map((gene: any) => ({
        id: gene.alleleId,
        geneName: gene.name,
        category: gene.category || 'Recorded',
        frequencyPct: gene.frequencyPct ?? (gene.successCorrelation ? Number(String(gene.successCorrelation).replace('%', '')) : null),
        winCorrelation: gene.winCorrelation ?? null,
        status: gene.status === 'LETHAL' ? 'lethal' : gene.status === 'BENEFICIAL' ? 'dominant_beneficial' : 'neutral'
      })));
    }).catch(() => setGenes([]));
  }, []);

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      <div style={{ padding: '12px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <BarChart3 size={14} color="var(--accent-blue)" /> Allele & Gene Frequency Analyzer (Heuristic Genomic Mining)
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Backend records only</span>
      </div>

      <div style={{ padding: '16px', flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: 'var(--bg-main)', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-secondary)', textAlign: 'left' }}>
              <th style={{ padding: '10px 12px' }}>Prompt Gene / Heuristic</th>
              <th style={{ padding: '10px 12px' }}>Category</th>
              <th style={{ padding: '10px 12px' }}>Fleet Frequency</th>
              <th style={{ padding: '10px 12px' }}>Win Correlation</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Genomic Status</th>
            </tr>
          </thead>
          <tbody>
            {genes.length === 0 && <tr><td colSpan={5} style={{ padding: '24px', color: 'var(--text-secondary)', textAlign: 'center' }}>No genomic data recorded.</td></tr>}
            {genes.map((gene, idx) => {
              const isBeneficial = gene.status === 'dominant_beneficial';
              const isLethal = gene.status === 'lethal';

              return (
                <tr key={gene.id} style={{ borderBottom: idx < genes.length - 1 ? '1px solid var(--panel-border)' : 'none' }} className="hover-bg-gray">
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {gene.geneName}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{gene.category}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '80px', height: '6px', background: 'var(--bg-main)', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${gene.frequencyPct || 0}%`, height: '100%', background: isLethal ? 'var(--danger)' : isBeneficial ? 'var(--success)' : 'var(--accent-blue)' }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{gene.frequencyPct === null ? '—' : `${gene.frequencyPct}%`}</span>
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
