import React, { useMemo, useState } from 'react';
import { Copy, Database, Search } from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

type RagHit = {
  id?: string;
  title?: string;
  summary?: string;
  source?: string;
  similarityScore?: number;
  cosineMetric?: number;
  category?: string;
};

const PAGE_SIZES = [8, 16, 32] as const;
const HISTORY_LIMIT = 5;

export const RagPlayground: React.FC = () => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<RagHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [limit, setLimit] = useState<number>(8);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const showToast = useToastStore((s) => s.showToast);

  const runSearch = async (rawQuery: string, searchLimit: number) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    try {
      const results: RagHit[] = await api.searchMemoryVector(trimmed, searchLimit);
      setHits(results);
      setActiveCategory(null);
      setHistory((prev) => [trimmed, ...prev.filter((q) => q !== trimmed)].slice(0, HISTORY_LIMIT));
    } catch (err: any) {
      setError(err?.message || 'RAG search failed');
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runSearch(query, limit);
  };

  const categories = useMemo(() => Array.from(new Set(hits.map((hit) => hit.category || 'Knowledge'))).sort(), [hits]);
  const visibleHits = activeCategory ? hits.filter((hit) => (hit.category || 'Knowledge') === activeCategory) : hits;

  const copyProvenance = async (hit: RagHit) => {
    const text = `source: ${hit.source || 'unknown'}\nscore: ${((hit.similarityScore || 0) * 100).toFixed(1)}%\nid: ${hit.id || 'n/a'}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast('success', 'Provenance copied', 'Source, score and id copied to clipboard.');
    } catch (err: any) {
      showToast('error', 'Copy failed', err?.message || 'Clipboard unavailable');
    }
  };

  return (
    <section style={{ padding: 24, width: '100%', maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Database size={22} color="var(--accent-blue)" />
        <h1 style={{ margin: 0 }}>RAG Playground</h1>
      </div>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 760 }}>
        Hybrid search over GenOS experiences and decisions, with lexical/semantic scores and provenance usable as a citation.
      </p>
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, margin: '20px 0' }}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask the knowledge base…" style={{ flex: 1, padding: '11px 13px', borderRadius: 6, border: '1px solid var(--panel-border)', background: 'var(--bg-main)', color: 'var(--text-primary)' }} />
        <select value={limit} onChange={(event) => setLimit(Number(event.target.value))} style={{ padding: '0 10px', borderRadius: 6, border: '1px solid var(--panel-border)', background: 'var(--bg-main)', color: 'var(--text-primary)' }} aria-label="Results per search">
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
        <button type="submit" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 16px', border: 0, borderRadius: 6, background: 'var(--accent-blue)', color: 'white', cursor: 'pointer' }}><Search size={15} />{loading ? 'Searching…' : 'Search'}</button>
      </form>
      {history.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '.75rem' }}>Recent:</span>
          {history.map((q) => <button key={q} className="gh-btn" onClick={() => { setQuery(q); void runSearch(q, limit); }} title={`Search again: ${q}`}>{q}</button>)}
        </div>
      )}
      {categories.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '.75rem' }}>Filter:</span>
          <button className="gh-btn" onClick={() => setActiveCategory(null)} style={{ background: activeCategory === null ? 'var(--bg-subtle)' : undefined }}>All ({hits.length})</button>
          {categories.map((category) => {
            const count = hits.filter((hit) => (hit.category || 'Knowledge') === category).length;
            return <button key={category} className="gh-btn" onClick={() => setActiveCategory(category)} style={{ background: activeCategory === category ? 'var(--bg-subtle)' : undefined }}>{category} ({count})</button>;
          })}
        </div>
      )}
      {error && <div style={{ color: 'var(--danger)', marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'grid', gap: 10 }}>
        {visibleHits.map((hit, index) => (
          <article key={hit.id || index} style={{ padding: 16, border: '1px solid var(--panel-border)', borderRadius: 8, background: 'var(--bg-main)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>{hit.title || 'Untitled source'}</strong>
              <span style={{ color: 'var(--success)', fontFamily: 'monospace' }}>{((hit.similarityScore || 0) * 100).toFixed(1)}%</span>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', margin: '5px 0 10px' }}>{hit.category || 'Knowledge'} · semantic {((hit.cosineMetric || 0) * 100).toFixed(1)}%</div>
            <div style={{ lineHeight: 1.5 }}>{hit.summary || 'No excerpt available.'}</div>
            {hit.source && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: '0.78rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{hit.source}</span>
                <button className="gh-btn" title="Copy provenance (source, score, id)" onClick={() => copyProvenance(hit)}><Copy size={12} /> Copy provenance</button>
              </div>
            )}
          </article>
        ))}
        {!loading && query && !visibleHits.length && !error && <div style={{ color: 'var(--text-secondary)' }}>No results.</div>}
      </div>
    </section>
  );
};
