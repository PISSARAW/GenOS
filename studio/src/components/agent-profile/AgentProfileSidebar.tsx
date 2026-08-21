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
          Autonomous counterfactual runtime agent for reproducible, forkable, and inspectable development tasks.
        </p>
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
          {['react', 'typescript', 'frontend', 'ui-refactor', 'autonomous'].map((tag) => (
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
