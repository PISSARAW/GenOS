import React from 'react';
import { Eye, GitFork, Octagon, ChevronDown } from 'lucide-react';
import { useToastStore } from '../../store/useToastStore';
import { api } from '../../api/client';

export interface TabItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  count?: number;
}

interface AgentProfileHeaderProps {
  activeAgent: {
    id: string;
    name: string;
    status: string;
    role?: string;
    workspaceId?: string | null;
    workspaceName?: string | null;
    hallucinationMonitoring?: boolean | number;
  };
  clonesCount: number;
  activeTab: string;
  tabs: TabItem[];
  onSelectTab: (tabId: string) => void;
  onRefreshClones: () => void;
}

export const AgentProfileHeader: React.FC<AgentProfileHeaderProps> = ({
  activeAgent,
  clonesCount,
  activeTab,
  tabs,
  onSelectTab,
  onRefreshClones
}) => {
  const showToast = useToastStore((state) => state.showToast);

  const handleSubscribe = async () => {
    try {
      await api.subscribeAgent(activeAgent.id);
      onRefreshClones();
      // subscribeAgent registers the agent for telemetry events only. True
      // hallucination detection lives in the Rust CLI (`genos hallucination
      // detect`) and has no Studio surface yet, so this control must not
      // claim otherwise.
      showToast('success', 'Telemetry Subscription Active', `${activeAgent.name} will emit telemetry events. Hallucination analysis is not part of this subscription yet.`);
    } catch (err: any) {
      showToast('error', 'Subscription Failed', err.message || 'Could not subscribe the agent to telemetry.');
    }
  };

  const handleCloneAgent = async () => {
    try {
      await api.cloneNode(activeAgent.id);
      showToast('success', 'Agent Cloned', `Spawned a new clone fork of ${activeAgent.name}`);
      onRefreshClones();
    } catch (err: any) {
      showToast('error', 'Clone Failed', err.message || 'Could not clone agent.');
    }
  };

  return (
    <div style={{ background: 'var(--bg-panel)', borderBottom: '1px solid var(--panel-border)', paddingTop: '24px' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 32px' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ 
              width: '24px', height: '24px', borderRadius: '4px', 
              background: '#1f6feb', display: 'flex', justifyContent: 'center', 
              alignItems: 'center', color: '#ffffff', fontWeight: 'bold', fontSize: '12px' 
            }}>
              G
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
              <span style={{ color: activeAgent.workspaceId ? 'var(--text-accent)' : 'var(--text-secondary)' }} className={activeAgent.workspaceId ? 'hover-underline' : undefined}>
                {activeAgent.workspaceName || activeAgent.workspaceId || 'No workspace attached'}
              </span>
              <span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>/</span>
              <span style={{ fontWeight: 600, cursor: 'pointer' }} className="hover-underline">{activeAgent.name}</span>
            </h1>
            <span style={{ 
              border: '1px solid var(--panel-border)', borderRadius: '12px', padding: '2px 8px', 
              fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'flex', 
              alignItems: 'center', gap: '4px', background: 'var(--bg-main)' 
            }}>
              <div style={{ 
                width: '8px', height: '8px', borderRadius: '50%', 
                background: activeAgent.status === 'running' ? 'var(--success)' : 'var(--text-muted)' 
              }}></div> 
              {activeAgent.status}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <div className="gh-btn-group" style={{ display: 'flex', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
              <button onClick={handleSubscribe} className="gh-btn" title="Subscribes the agent to telemetry events (no hallucination analysis yet)" style={{ border: 'none', borderRadius: 0, padding: '4px 12px' }}>
                <Eye size={14} color="var(--text-secondary)" /> {activeAgent.hallucinationMonitoring ? 'Subscribed' : 'Subscribe'} <ChevronDown size={12} color="var(--text-muted)"/>
              </button>
              <div style={{ width: '1px', background: 'var(--panel-border)' }}></div>
              <span aria-label={`${activeAgent.hallucinationMonitoring ? 1 : 0} monitoring subscriptions`} style={{ padding: '4px 12px', fontWeight: 600 }}>
                {activeAgent.hallucinationMonitoring ? 1 : 0}
              </span>
            </div>

            <div className="gh-btn-group" style={{ display: 'flex', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
              <button onClick={handleCloneAgent} className="gh-btn" style={{ border: 'none', borderRadius: 0, padding: '4px 12px' }}>
                <GitFork size={14} color="var(--text-secondary)" /> Clone Agent <ChevronDown size={12} color="var(--text-muted)"/>
              </button>
              <div style={{ width: '1px', background: 'var(--panel-border)' }}></div>
              <span aria-label={`${clonesCount} agent clones`} style={{ padding: '4px 12px', fontWeight: 600 }}>
                {clonesCount}
              </span>
            </div>

            <button disabled title="Agent quarantine is not available here. Tool circuit breakers are managed in MCP Sandbox." className="gh-btn" style={{ border: '1px solid var(--danger)', color: 'var(--danger)', background: 'transparent' }}>
              <Octagon size={14} color="var(--danger)" /> Agent breaker unavailable
            </button>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto' }}>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <div 
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', cursor: 'pointer',
                  borderBottom: isActive ? '2px solid #fd8c73' : '2px solid transparent',
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: '0.85rem'
                }}
                className="gh-tab"
              >
                <Icon size={16} color={isActive ? "var(--text-primary)" : "var(--text-muted)"} /> 
                {tab.label}
                {tab.count !== undefined && (
                  <span style={{ background: 'var(--bg-subtle)', borderRadius: '12px', padding: '2px 6px', fontSize: '0.7rem', fontWeight: 500, border: '1px solid var(--panel-border)' }}>
                    {tab.count}
                  </span>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};
