import React, { useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';

export interface IdeInspectorProps {
  code: string;
  language?: string;
  theme?: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
}

export const IdeInspector: React.FC<IdeInspectorProps> = (props) => {
  const {
    code,
    language = 'javascript',
    theme = 'vs-dark',
    onChange,
    readOnly = false,
  } = props;

  const editorRef = useRef<any>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
  };

  return (
    <div style={{ height: '100%', width: '100%', minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 16px', backgroundColor: '#1e1e1e', color: '#fff', borderBottom: '1px solid #333', fontSize: '12px', fontWeight: 'bold' }}>
        Inspector / Debugger IDE
      </div>
      <div style={{ flex: 1 }}>
        <Editor
          height="100%"
          width="100%"
          theme={theme}
          language={language}
          value={code}
          onChange={onChange}
          onMount={handleEditorDidMount}
          options={{
            readOnly,
            minimap: { enabled: true },
            fontSize: 14,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
            formatOnPaste: true,
          }}
        />
      </div>
    </div>
  );
};
