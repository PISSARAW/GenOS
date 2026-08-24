import React, { useState, useEffect, useCallback } from 'react';
import { 
  CircleDot, User, Octagon, Search, Check, Plus
} from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';

interface ParsedSearch {
  state: 'open' | 'closed' | null;
  terms: string[];
}

const parseSearchQuery = (raw: string): ParsedSearch => {
  const result: ParsedSearch = { state: null, terms: [] };
  raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .forEach((token) => {
      if (token === 'state:open') result.state = 'open';
      else if (token === 'state:closed') result.state = 'closed';
      else if (token === 'is:issue') return;
      else result.terms.push(token);
    });
  return result;
};

const toTimestamp = (value: any): number => {
  if (!value) return 0;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const GlobalAlerts: React.FC<{ onNavigateDeploy?: () => void }> = ({ onNavigateDeploy }) => {
  const [activeFilter, setActiveFilter] = useState('Requires Human Override');
  const [issues, setIssues] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('open');
  const [sortOrder, setSortOrder] = useState('newest');
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const showToast = useToastStore((state) => state.showToast);

  const fetchAlerts = useCallback(() => {
    api.getAlerts()
      .then((data) => {
        if (Array.isArray(data)) {
          setIssues(data);
          setLastUpdated(Date.now());
        }
      })
      .catch((e: any) => showToast('error', 'Alerts Unavailable', e?.message || 'Backend unreachable.'));
  }, [showToast]);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 10000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const handleKillTask = async (id: string) => {
    try {
      await api.killTask(id);
      showToast('warning', 'Alert Resolved', `Alert ${id} was marked resolved. No runtime process was terminated.`);
      fetchAlerts();
    } catch (e: any) {
      showToast('error', 'Kill Failed', e.message);
    }
  };

  const filters = [
    'Requires Human Override',
    'Delegated to Fleet',
    'Agent Questions (@human)'
  ];

  const parsedSearch = parseSearchQuery(searchTerm);

  const sidebarFiltered = issues.filter((issue) => {
    if (activeFilter === 'Requires Human Override' && issue.status !== 'blocked') return false;
    if (activeFilter === 'Agent Questions (@human)' && issue.status !== 'question') return false;
    if (activeFilter === 'Delegated to Fleet' && issue.status !== 'running') return false;
    if (parsedSearch.state === 'open' && issue.status === 'resolved') return false;
    if (parsedSearch.state === 'closed' && issue.status !== 'resolved') return false;
    if (parsedSearch.terms.length > 0) {
      const haystacks = [issue.title, issue.contextSnapshot]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      const allMatch = parsedSearch.terms.every((term) =>
        haystacks.some((haystack) => haystack.includes(term))
      );
      if (!allMatch) return false;
    }
    return true;
  });

  const openCount = sidebarFiltered.filter((issue) => issue.status !== 'resolved').length;
  const closedCount = sidebarFiltered.filter((issue) => issue.status === 'resolved').length;

  const filteredIssues = [...sidebarFiltered].filter((issue) => {
    if (statusFilter === 'open' && issue.status === 'resolved') return false;
    if (statusFilter === 'closed' && issue.status !== 'resolved') return false;
    return true;
  });

  filteredIssues.sort((a, b) =>
    sortOrder === 'oldest'
      ? toTimestamp(a.time) - toTimestamp(b.time)
      : toTimestamp(b.time) - toTimestamp(a.time)
  );

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', background: 'var(--bg-main)' }}>
      
      <div style={{ maxWidth: '1280px', margin: '32px auto', padding: '0 32px', display: 'flex', gap: '32px' }}>
        
        {/* Left Sidebar Filters */}
        <div style={{ width: '256px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px', background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '8px' }}>
            {filters.map((f) => (
              <div 
                key={f}
                onClick={() => setActiveFilter(f)}
                style={{ 
                  padding: '8px 12px', 
                  cursor: 'pointer', 
                  borderRadius: '6px', 
                  fontSize: '0.85rem', 
                  color: activeFilter === f ? 'var(--text-primary)' : 'var(--text-secondary)', 
                  background: activeFilter === f ? 'var(--bg-subtle)' : 'transparent', 
                  fontWeight: activeFilter === f ? 600 : 400
                }}
              >
                {f}
              </div>
            ))}
          </div>
        </div>

        {/* Main List Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Top Search & Button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ flex: 1, marginRight: '16px', position: 'relative' }}>
              <input 
                type="text" 
                placeholder="Search alerts (is:issue state:open...)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '6px 12px 6px 32px', fontSize: '0.85rem', border: '1px solid var(--panel-border)', borderRadius: '6px', outline: 'none', background: 'var(--bg-panel)', color: 'var(--text-primary)' }}
              />
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '8px' }} />
            </div>
            <button onClick={onNavigateDeploy} disabled={!onNavigateDeploy} title={onNavigateDeploy ? undefined : 'Agent deployment navigation is unavailable.'} className="gh-btn gh-btn-primary" style={{ padding: '6px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={14} /> Delegate Goal (Spawn Agent)
            </button>
          </div>

          {/* Issues Box */}
          <div style={{ border: '1px solid var(--panel-border)', borderRadius: '6px', background: 'var(--bg-panel)', overflow: 'hidden' }}>
            
            {/* Box Header */}
            <div style={{ background: 'var(--bg-subtle)', padding: '16px', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-secondary)' }}>
                <span onClick={() => setStatusFilter('open')} style={{ fontWeight: statusFilter === 'open' ? 600 : 400, color: statusFilter === 'open' ? 'var(--text-primary)' : 'inherit', cursor: 'pointer' }}>
                  <CircleDot size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }}/> {openCount} Open
                </span>
                <span onClick={() => setStatusFilter('closed')} style={{ fontWeight: statusFilter === 'closed' ? 600 : 400, color: statusFilter === 'closed' ? 'var(--text-primary)' : 'inherit', cursor: 'pointer' }}>
                  <Check size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }}/> {closedCount} Closed
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: 'var(--text-secondary)' }}>
                <span style={{ cursor: 'pointer' }} onClick={() => setSortOrder((prev) => prev === 'newest' ? 'oldest' : 'newest')}>
                  {sortOrder === 'newest' ? 'Last updated ▾' : 'Oldest first ▴'}
                </span>
              </div>
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filteredIssues.map((issue, i) => {
                let Icon = CircleDot;
                let iconClass = 'pulse-green';
                
                if (issue.status === 'blocked') {
                  Icon = Octagon;
                  iconClass = 'blink-red';
                } else if (issue.status === 'question') {
                  Icon = User;
                  iconClass = '';
                }

                return (
                  <div key={issue.id || i} style={{ display: 'flex', padding: '14px 16px', borderBottom: i < filteredIssues.length - 1 ? '1px solid var(--panel-border)' : 'none', gap: '12px' }} className="hover-bg-gray">
                    
                    {/* Status Icon */}
                    <div style={{ paddingTop: '2px' }}>
                      <Icon size={16} className={iconClass} style={{ color: issue.status === 'question' ? '#d29922' : issue.status === 'blocked' ? 'var(--danger)' : 'var(--success)' }} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span 
                          onClick={() => setExpandedIssue(expandedIssue === issue.id ? null : issue.id)}
                          style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }} 
                          className="hover-blue"
                        >
                          {issue.title}
                        </span>
                        
                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px', border: '1px solid var(--panel-border)', color: issue.severity === 'high' ? 'var(--danger)' : 'var(--accent-blue)', fontWeight: 500 }}>
                          {issue.severity || 'normal'}
                        </span>
                      </div>

                      {/* Metadata */}
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--accent-blue)' }}>{issue.id}</span>
                        {' · '} Workspace: {issue.workspace}
                        {' · '} Assigned to: {issue.agent}
                        {' · '} Confidence: {issue.confidence}
                        {issue.time ? ` · ${new Date(issue.time).toLocaleString()}` : ''}
                      </div>

                      {expandedIssue === issue.id && (
                        <div style={{ marginTop: '12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', padding: '16px' }}>
                          <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>Context Snapshot</h4>
                          <pre style={{ margin: 0, fontSize: '0.75rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                            {issue.contextSnapshot || 'No context snapshot recorded.'}
                          </pre>
                          <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                            <button disabled title="Direct navigation to an alert's agent profile is not available in this view." className="gh-btn gh-btn-primary" style={{ padding: '4px 12px', fontSize: '0.75rem' }}>Agent profile unavailable</button>
                            <button onClick={() => handleKillTask(issue.id)} className="gh-btn" style={{ padding: '4px 12px', fontSize: '0.75rem', color: 'var(--danger)' }}>Resolve Alert</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ background: 'var(--bg-subtle)', borderTop: '1px solid var(--panel-border)', padding: '10px 16px', fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'right' }}>
              Refreshed every 10s · Last updated:{' '}
              {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Never'}
            </div>
            
          </div>

        </div>
      </div>
    </div>
  );
};
