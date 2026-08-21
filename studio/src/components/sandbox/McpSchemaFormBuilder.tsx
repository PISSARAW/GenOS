import React, { useEffect, useState } from 'react';
import { Sliders, Code } from 'lucide-react';
import { getToolAlias } from '../../utils/toolLabels';
import { api } from '../../api/client';

interface FormBuilderProps {
  toolName: string;
  onChange: (args: Record<string, any>) => void;
}

export const McpSchemaFormBuilder: React.FC<FormBuilderProps> = ({ toolName, onChange }) => {
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [schema, setSchema] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [jsonString, setJsonString] = useState(JSON.stringify(formData, null, 2));

  useEffect(() => {
    api.getMcpToolSchema(toolName).then((nextSchema: any) => {
      setSchema(nextSchema);
      const properties = nextSchema?.properties || {};
      const initial = Object.fromEntries(Object.entries(properties).map(([key, value]: any) => [key, value.default ?? (value.type === 'boolean' ? false : value.type === 'integer' || value.type === 'number' ? 0 : '')]));
      setFormData(initial);
      setJsonString(JSON.stringify(initial, null, 2));
      onChange(initial);
    }).catch(() => setSchema(null));
  }, [toolName]);

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
          <Sliders size={14} color="var(--accent-blue)" /> JSON Schema Form Inspector ({getToolAlias(toolName)})
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
            {Object.entries(schema?.properties || {}).map(([key, field]: any) => (
              <div key={key} style={{ gridColumn: field.type === 'string' && field.description?.length > 50 ? 'span 2' : undefined }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{key}{schema?.required?.includes(key) ? ' *' : ''}</label>
                {field.type === 'boolean' ? <input type="checkbox" checked={!!formData[key]} onChange={(e) => handleFieldChange(key, e.target.checked)} /> : <input type={field.type === 'integer' || field.type === 'number' ? 'number' : 'text'} value={formData[key] ?? ''} onChange={(e) => handleFieldChange(key, field.type === 'integer' || field.type === 'number' ? Number(e.target.value) : e.target.value)} style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }} />}
                {field.description && <div style={{ marginTop: '3px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{field.description}</div>}
              </div>
            ))}
            {!schema && <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Loading schema…</div>}
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
