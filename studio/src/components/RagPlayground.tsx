import React, { useState } from 'react';
import { Search, Database, ExternalLink } from 'lucide-react';
import { api } from '../api/client';

type RagHit = {
  id?: string;
  title?: string;
  summary?: string;
  source?: string;
  similarityScore?: number;
  cosineMetric?: number;
  category?: string;
};

export const RagPlayground: React.FC = () => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RagHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const runSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    try {
      setHits(await api.searchMemoryVector(query.trim(), 8));
    } catch (err: any) {
      setError(err?.message || 'RAG search failed');
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section style={{ padding: 24, width: '100%', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Database size={22} color="var(--accent-blue)" />
        <h1 style={{ margin: 0 }}>RAG Playground</h1>
      </div>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 760 }}>
        Recherche hybride sur les expériences et décisions GenOS, avec scores lexical/sémantique et provenance exploitable comme citation.
      </p>
      <form onSubmit={runSearch} style={{ display: 'flex', gap: 8, margin: '20px 0' }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Posez une question à la base de connaissances…" style={{ flex: 1, padding: '11px 13px', borderRadius: 6, border: '1px solid var(--panel-border)', background: 'var(--bg-main)', color: 'var(--text-primary)' }} />
        <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 16px', border: 0, borderRadius: 6, background: 'var(--accent-blue)', color: 'white', cursor: 'pointer' }}><Search size={15} />{loading ? 'Recherche…' : 'Rechercher'}</button>
      </form>
      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {hits.map((hit, index) => (
          <article key={hit.id || index} style={{ padding: 16, border: '1px solid var(--panel-border)', borderRadius: 8, background: 'var(--bg-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>{hit.title || 'Source sans titre'}</strong>
              <span style={{ color: 'var(--success)', fontFamily: 'monospace' }}>{((hit.similarityScore || 0) * 100).toFixed(1)}%</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '5px 0 10px' }}>{hit.category || 'Knowledge'} · semantic {((hit.cosineMetric || 0) * 100).toFixed(1)}%</div>
            <div style={{ lineHeight: 1.5 }}>{hit.summary || 'Aucun extrait disponible.'}</div>
            {hit.source && <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 10, color: 'var(--accent-blue)', fontSize: '0.78rem' }}><ExternalLink size={13} /> {hit.source}</div>}
          </article>
        ))}
        {!loading && query && !hits.length && !error && <div style={{ color: 'var(--text-secondary)' }}>Aucun résultat.</div>}
      </div>
    </section>
  );
};
