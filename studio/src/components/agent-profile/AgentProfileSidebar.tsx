import React from 'react';
import { Eye, GitFork, Book, Shield, Settings } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';

interface AgentProfileSidebarProps {
  activeAgent: any;
  clonesCount: number;
  onSelectTab: (tabId: string) => void;
}

export const AgentProfileSidebar: React.FC<AgentProfileSidebarProps> = ({
  activeAgent,
  clonesCount,
  onSelectTab
}) => {
  const showToast = useToastStore((state) => state.showToast);
  const relationLabels: Record<string, string> = {
    child: 'Child of',
    mutation: 'Mutation of',
    clone: 'Clone of'
  };
  const relationLabel = activeAgent.lineageRelation ? relationLabels[activeAgent.lineageRelation] : null;
  const about = activeAgent.about || activeAgent.currentTask || `Autonomous ${activeAgent.role || 'GenOS'} agent.`;
  const sourceText = [activeAgent.role, activeAgent.currentTask, activeAgent.about]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const capabilityKeywords = [
    ['architecture', 'architecture'],
    ['plan', 'planning'],
    ['implement', 'implementation'],
    ['build', 'implementation'],
    ['test', 'testing'],
    ['debug', 'debugging'],
    ['review', 'review'],
    ['telemetry', 'telemetry'],
    ['monitor', 'monitoring'],
    ['security', 'security'],
    ['memory', 'memory'],
    ['genome', 'genome'],
    ['research', 'research']
  ];
  const inferredCapabilities = capabilityKeywords
    .filter(([keyword]) => sourceText.includes(keyword))
    .map(([, label]) => label);
  const tags = Array.from(new Set([
    activeAgent.language,
    activeAgent.role,
    activeAgent.agentType,
    activeAgent.modelTier,
    activeAgent.isolationMode,
    ...inferredCapabilities
  ].filter(Boolean).map((tag) => String(tag))));

  const handleOpenSettings = () => {
    showToast('info', 'Agent Configuration', `Configuration parameters for ${activeAgent.name}`);
  };

  const handleTagClick = (tag: string) => {
    showToast('info', 'Filter Applied', `Filter applied: #${tag}`);
  };

  return (
    <div style={{ width: '296px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          About 
          <Settings size={16} color="var(--text-muted)" style={{ cursor: 'pointer' }} onClick={handleOpenSettings}/>
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
          {about}
        </p>
        {relationLabel && (activeAgent.parentAgentName || activeAgent.parentAgentId) && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            <strong>{relationLabel}</strong> {activeAgent.parentAgentName || activeAgent.parentAgentId}
          </p>
        )}
        <div 
          onClick={() => onSelectTab('state')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', cursor: 'pointer' }}
          className="hover-blue"
        >
          <Book size={16} color="var(--text-muted)" /> Readme
        </div>
        <div 
          onClick={() => onSelectTab('health')}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px', cursor: 'pointer' }}
          className="hover-blue"
        >
          <Shield size={16} color="var(--text-muted)" /> Security policy
        </div>
        
        {/* Tags */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {tags.map((tag) => (
            <span 
              key={tag} 
              onClick={() => handleTagClick(tag)}
              style={{ 
                background: 'var(--bg-subtle)', 
                color: 'var(--accent-blue)', 
                padding: '4px 10px', 
                borderRadius: '12px', 
                fontSize: '0.75rem', 
                fontWeight: 500, 
                cursor: 'pointer',
                border: '1px solid var(--panel-border)'
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--panel-border)', margin: 0 }} />

      <div>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Activity</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          <Eye size={16} color="var(--text-muted)" /> <strong>{activeAgent.status === 'running' ? 1 : 0}</strong> watching
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          <GitFork size={16} color="var(--text-muted)" /> <strong>{clonesCount}</strong> clones
        </div>
      </div>

    </div>
  );
};
