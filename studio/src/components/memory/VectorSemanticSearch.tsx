import React, { useState } from 'react';
import { Search, Database, Brain, ArrowRight } from 'lucide-react';
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

export const VectorSemanticSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const showToast = useToastStore((state) => state.showToast);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setIsSearching(true);
    try {
      const hits = await api.searchMemoryVector(query);
      setResults(Array.isArray(hits) ? hits.map((h: any, i: number) => ({
        id: h.id || `memory-${i}`,
        title: h.title || 'Memory result',
        summary: h.summary || h.semantic_summary || '',
        author: h.author || h.author_name || 'Unknown',
        similarityScore: Number(h.similarityScore || 0),
        tags: Array.isArray(h.tags) ? h.tags : []
      })) : []);
      showToast('success', 'Vector Recall Completed', `Retrieved ${Array.isArray(hits) ? hits.length : 0} persisted memories.`);
    } catch (e: any) {
      showToast('error', 'Search Error', e.message);
    } finally {
      setIsSearching(false);
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
      </div>

      {/* Results List */}
      <div style={{ padding: '16px 20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
        {results.map((item) => (
          <div 
            key={item.id} 
            style={{ 
              background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', 
              padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '8px' 
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-blue)' }} className="hover-underline">
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
              <div style={{ display: 'flex', gap: '6px' }}>
                {item.tags.map((t) => (
                  <span key={t} style={{ fontSize: '0.7rem', padding: '1px 6px', background: 'var(--bg-subtle)', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                    #{t}
                  </span>
                ))}
              </div>
              <button 
                onClick={() => showToast('info', 'Few-Shot Injected', `Injected ${item.id} as few-shot reference into prompt scratchpad.`)} 
                className="gh-btn" style={{ fontSize: '0.7rem', padding: '2px 8px' }}
              >
                Inject into Prompt <ArrowRight size={10} />
              </button>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
};
