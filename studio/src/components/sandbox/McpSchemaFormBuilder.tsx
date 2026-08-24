import React, { useEffect, useState } from 'react';
import { Sliders, Code, RotateCcw } from 'lucide-react';
import { getToolAlias } from '../../utils/toolLabels';
import { api } from '../../api/client';

interface FormBuilderProps {
  toolName: string;
  onChange: (args: Record<string, any>) => void;
  onValidityChange?: (valid: boolean) => void;
}

const buildDefaults = (schema: any): Record<string, any> => {
  const properties = schema?.properties || {};
  return Object.fromEntries(Object.entries(properties).map(([key, value]: any) => [key, value.default ?? (value.type === 'boolean' ? false : value.type === 'integer' || value.type === 'number' ? 0 : '')]));
};

const findMissingRequired = (schema: any, formData: Record<string, any>): string[] => {
  const required: string[] = schema?.required || [];
  return required.filter((key) => {
    const val = formData[key];
    return val === undefined || val === null || val === '';
  });
};

export const McpSchemaFormBuilder: React.FC<FormBuilderProps> = ({ toolName, onChange, onValidityChange }) => {
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [schema, setSchema] = useState<any>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [jsonString, setJsonString] = useState(JSON.stringify(formData, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);

  const fetchSchema = () => {
    setSchemaLoading(true);
    setSchemaError(null);
    api.getMcpToolSchema(toolName).then((nextSchema: any) => {
      setSchema(nextSchema);
      const initial = buildDefaults(nextSchema);
      setFormData(initial);
      setJsonString(JSON.stringify(initial, null, 2));
      setJsonError(null);
      onChange(initial);
      setSchemaLoading(false);
    }).catch((e: any) => {
      setSchema(null);
      setSchemaError(e?.message || 'Failed to load tool schema.');
      setSchemaLoading(false);
    });
  };

  useEffect(() => {
    fetchSchema();
  }, [toolName]);

  useEffect(() => {
    if (!schema) {
      onValidityChange?.(!schemaError);
      return;
    }
    const missing = findMissingRequired(schema, formData);
    onValidityChange?.(!jsonError && missing.length === 0);
  }, [schema, schemaError, formData, jsonError]);

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
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError('Raw payload must be a JSON object.');
        return;
      }
      setJsonError(null);
      setFormData(parsed);
      onChange(parsed);
    } catch (e: any) {
      setJsonError(`Invalid JSON: ${e.message}`);
    }
  };

  const handleReset = () => {
    if (!schema) return;
    const initial = buildDefaults(schema);
    setFormData(initial);
    setJsonString(JSON.stringify(initial, null, 2));
    setJsonError(null);
    onChange(initial);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', background: 'var(--bg-main)', border: '1px solid var(--panel-border)', borderRadius: '6px', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' };
  const missingRequired = schema ? findMissingRequired(schema, formData) : [];
  const blocked = !!jsonError || missingRequired.length > 0;

  return (
    <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--panel-border)', borderRadius: '6px', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '10px 16px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Sliders size={14} color="var(--accent-blue)" /> JSON Schema Form Inspector ({getToolAlias(toolName)})
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={handleReset}
            disabled={!schema}
            title="Reset all fields to schema defaults"
            className="gh-btn"
            style={{ fontSize: '0.75rem', padding: '2px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <RotateCcw size={12} /> Reset
          </button>
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
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{key}{schema?.required?.includes(key) ? <span style={{ color: 'var(--danger)' }}> *</span> : ''}</label>
                {field.enum ? (
                  <select
                    value={formData[key] ?? ''}
                    onChange={(e) => handleFieldChange(key, e.target.value)}
                    style={inputStyle}
                  >
                    {!schema?.required?.includes(key) && <option value="">— none —</option>}
                    {field.enum.map((opt: any) => (
                      <option key={String(opt)} value={String(opt)}>{String(opt)}</option>
                    ))}
                  </select>
                ) : field.type === 'boolean' ? <input type="checkbox" checked={!!formData[key]} onChange={(e) => handleFieldChange(key, e.target.checked)} /> : <input type={field.type === 'integer' || field.type === 'number' ? 'number' : 'text'} value={formData[key] ?? ''} onChange={(e) => handleFieldChange(key, field.type === 'integer' || field.type === 'number' ? Number(e.target.value) : e.target.value)} style={inputStyle} />}
                {field.description && <div style={{ marginTop: '3px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{field.description}</div>}
              </div>
            ))}
            {schemaLoading && !schema && !schemaError && <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Loading schema…</div>}
            {schemaError && (
              <div style={{ gridColumn: 'span 2', fontSize: '0.8rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>⚠ Failed to load schema: {schemaError}</span>
                <button onClick={fetchSchema} className="gh-btn" style={{ fontSize: '0.75rem', padding: '2px 8px' }}>Retry</button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <textarea
              value={jsonString}
              onChange={(e) => handleJsonChange(e.target.value)}
              style={{ ...inputStyle, height: '160px', padding: '12px', fontFamily: 'monospace', resize: 'none', borderColor: jsonError ? 'var(--danger)' : 'var(--panel-border)' }}
            />
            {jsonError && <div style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--danger)' }}>{jsonError}</div>}
          </div>
        )}

        {blocked && (
          <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--danger)' }}>
            {jsonError ? 'Fix the raw JSON error to enable Dry-Run and Execute.' : `Missing required fields: ${missingRequired.join(', ')}`}
          </div>
        )}
      </div>

    </div>
  );
};
