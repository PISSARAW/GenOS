import React, { useState } from 'react';
import { Sliders, Code } from 'lucide-react';

interface FormBuilderProps {
  toolName: string;
  onChange: (args: Record<string, any>) => void;
}

export const McpSchemaFormBuilder: React.FC<FormBuilderProps> = ({ toolName, onChange }) => {
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [formData, setFormData] = useState<Record<string, any>>({
    query: 'Audit authentication middleware and sanitize tokens',
    workspaceId: 'ws-genos-core',
    timeoutMs: 5000,
    dryRun: true,
    isolationLevel: 'sandboxed'
  });
  const [jsonString, setJsonString] = useState(JSON.stringify(formData, null, 2));

  const handleFieldChange = (key: string, val: any) => {
    const updated = { ...formData, [key]: val };
    setFormData(updated);
    setJsonString(JSON.stringify(updated, null, 2));
    onChange(updated);
  };

  const handleJsonChange = (val: string) => {
    setJsonString(val);
    try {
      const parsed = JSON.parse(val);
      setFormData(parsed);
      onChange(parsed);
    } catch {}
  };

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>
      
      {/* Header */}
      <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sliders size={14} color="var(--accent-blue)" /> JSON Schema Form Inspector ({toolName})
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button 
            onClick={() => setMode('visual')} 
            className="gh-btn"
            style={{ fontSize: '0.75rem', padding: '2px 8px', background: mode === 'visual' ? 'var(--panel-border)' : 'transparent' }}
          >
            Visual Form
          </button>
          <button 
            onClick={() => setMode('json')} 
            className="gh-btn"
            style={{ fontSize: '0.75rem', padding: '2px 8px', background: mode === 'json' ? 'var(--panel-border)' : 'transparent' }}
          >
            <Code size={12} /> Raw JSON
          </button>
        </div>
      </div>

      {/* Form Content */}
      <div style={{ padding: '16px' }}>
        {mode === 'visual' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Query / Instruction</label>
              <input 
                type="text" 
                value={formData.query || ''} 
                onChange={(e) => handleFieldChange('query', e.target.value)} 
                style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Workspace ID</label>
              <input 
                type="text" 
                value={formData.workspaceId || ''} 
                onChange={(e) => handleFieldChange('workspaceId', e.target.value)} 
                style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Timeout (ms)</label>
              <input 
                type="number" 
                value={formData.timeoutMs || 5000} 
                onChange={(e) => handleFieldChange('timeoutMs', parseInt(e.target.value))} 
                style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>Isolation Level</label>
              <select 
                value={formData.isolationLevel || 'sandboxed'} 
                onChange={(e) => handleFieldChange('isolationLevel', e.target.value)} 
                style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
              >
                <option value="sandboxed">Isolated Sandbox (No Disk Access)</option>
                <option value="branch_vfs">Virtual File System (In-Memory)</option>
                <option value="workspace_direct">Direct Workspace Hook</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
              <input 
                type="checkbox" 
                id="dryRunCheck" 
                checked={!!formData.dryRun} 
                onChange={(e) => handleFieldChange('dryRun', e.target.checked)} 
                style={{ accentColor: 'var(--accent-blue)', cursor: 'pointer' }}
              />
              <label htmlFor="dryRunCheck" style={{ fontSize: '0.8rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                Enable Dry-Run Mode (Simulate Blast Radius)
              </label>
            </div>

          </div>
        ) : (
          <textarea 
            value={jsonString} 
            onChange={(e) => handleJsonChange(e.target.value)} 
            style={{ width: '100%', height: '160px', padding: '12px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.8rem', outline: 'none', resize: 'none' }}
          />
        )}
      </div>

    </div>
  );
};
