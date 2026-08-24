import React, { useMemo, useState } from 'react';
import { Search, Database, Brain, ArrowRight, X } from 'lucide-react';
import { api } from '../../api/client';
import { useToastStore } from '../../store/useToastStore';

interface SearchResultItem {
  id: string;
  title: string;
  summary: string;
  author: string;
  similarityScore: number;
  tags: string[];
}

const PAGE_SIZES = [10, 25, 50];

export const VectorSemanticSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [similarityThreshold, setSimilarityThreshold] = useState(0);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const showToast = useToastStore((state) => state.showToast);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setIsSearching(true);
    try {
      const hits = await api.searchMemoryVector(query, pageSize);
      setResults(Array.isArray(hits) ? hits.map((h: any, i: number) => ({
        id: h.id || `memory-${i}`,
        title: h.title || 'Memory result',
        summary: h.summary || h.semantic_summary || '',
        author: h.author || h.author_name || 'Unknown',
        similarityScore: Number(h.similarityScore || 0),
        tags: Array.isArray(h.tags) ? h.tags : []
      })) : []);
      setActiveTags([]);
      setHasSearched(true);
      showToast('success', 'Vector Recall Completed', `Retrieved ${Array.isArray(hits) ? hits.length : 0} persisted memories.`);
    } catch (e: any) {
      showToast('error', 'Search Error', e.message);
    } finally {
      setIsSearching(false);
    }
  };

  const filteredResults = useMemo(() => results.filter((item) =>
    item.similarityScore >= similarityThreshold &&
    activeTags.every((tag) => item.tags.includes(tag))
  ), [results, similarityThreshold, activeTags]);

  const toggleTagFilter = (tag: string) => {
    setActiveTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]);
  };

  const copyReference = async (item: SearchResultItem) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ id: item.id, title: item.title, summary: item.summary }));
      showToast('success', 'Memory Reference Copied', `${item.id} was copied to the clipboard.`);
    } catch {
      showToast('error', 'Copy Failed', 'The memory reference could not be copied.');
    }
  };

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Search Header */}
      <div style={{ padding: '16px 20px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
          <Database size={14} color="var(--accent-blue)" /> Hybrid Vector & Lexical Experience Engine (Cosine Similarity on SQLite)
        </div>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input 
              type="text" 
              value={query} 
              onChange={(e) => setQuery(e.target.value)} 
              placeholder="Search episodic memory (e.g. solve CSRF vulnerability, optimize bisection)..."
              style={{ width: '100%', padding: '8px 12px 8px 34px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} 
            />
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '10px' }} />
          </div>
          <button type="submit" disabled={isSearching} className="gh-btn gh-btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
            {isSearching ? 'Querying...' : 'Cosine Search'}
          </button>
        </form>

        {/* Retrieval Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Page size</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              style={{ padding: '3px 8px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '4px', color: 'var(--text-primary)', fontSize: '0.75rem' }}
            >
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '200px' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Min similarity</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={similarityThreshold}
              onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent-blue)' }}
            />
            <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-primary)', width: '34px' }}>
              {Math.round(similarityThreshold * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Active Tag Filter Chips */}
      {activeTags.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '10px 20px 0 20px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Filters:</span>
          {activeTags.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTagFilter(tag)}
              style={{
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', padding: '2px 8px',
                background: 'var(--bg-subtle)', borderRadius: '12px', border: '1px solid var(--accent-blue)',
                color: 'var(--accent-blue)', cursor: 'pointer'
              }}
            >
              #{tag} <X size={10} />
            </button>
          ))}
          <button
            onClick={() => setActiveTags([])}
            className="gh-btn"
            style={{ fontSize: '0.65rem', padding: '2px 8px' }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Results List */}
      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
        {!hasSearched && !isSearching && (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Enter a query above and run Cosine Search to recall persisted episodic memories by semantic similarity.
          </div>
        )}
        {hasSearched && !isSearching && filteredResults.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            No memories matched the current query{activeTags.length > 0 || similarityThreshold > 0 ? ' and active filters.' : '.'}
          </div>
        )}
        {filteredResults.map((item) => (
          <div 
            key={item.id} 
            style={{ 
              background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', 
              padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-blue)' }}>
                  {item.title}
                </span>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Author: <strong>{item.author}</strong> · Memory Node: <span style={{ fontFamily: 'monospace' }}>{item.id}</span>
                </div>
              </div>

              {/* Similarity Pill */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Brain size={12} color="var(--success)" />
                <span style={{ 
                  padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600,
                  background: 'rgba(35, 134, 54, 0.15)', color: 'var(--success)', border: '1px solid var(--success)'
                }}>
                  {Math.round(item.similarityScore * 100)}% Match
                </span>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              {item.summary}
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--panel-border)', paddingTop: '8px' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {item.tags.map((t) => (
                  <button
                    key={t}
                    onClick={() => toggleTagFilter(t)}
                    title={`Filter results by #${t}`}
                    style={{
                      fontSize: '0.7rem', padding: '1px 6px', background: 'var(--bg-subtle)', borderRadius: '4px',
                      border: activeTags.includes(t) ? '1px solid var(--accent-blue)' : '1px solid transparent',
                      color: activeTags.includes(t) ? 'var(--accent-blue)' : 'var(--text-secondary)', cursor: 'pointer'
                    }}
                  >
                    #{t}
                  </button>
                ))}
              </div>
              <button
                onClick={() => copyReference(item)}
                className="gh-btn" style={{ fontSize: '0.7rem', padding: '2px 8px' }}
              >
                Copy reference <ArrowRight size={10} />
              </button>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
};
