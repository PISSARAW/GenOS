import { useState, useEffect, useRef } from 'react';
import './index.css';
import { parseGriotResponse } from './utils/parser';
import {
  IconChat, IconFolder, IconCloud, IconPlus, IconMic, IconArrowUp,
  IconGitBranch, IconCode, IconShare, IconLayout
} from './components/Icons';
import { GriotExecutionHeader } from './components/GriotExecutionHeader';
import { MessageWithActions } from './components/MessageWithActions';

interface Message {
  id: number;
  author: 'User' | 'Griot';
  text: string;
  duration?: string;
}

const SLASH_COMMANDS = [
  { cmd: '/trinity ', desc: "Force l'orchestrateur sur 3 mondes parallèles." },
  { cmd: '/snapshot', desc: "Fige l'état actuel du workspace." },
  { cmd: '/apoptosis', desc: "Stoppe immédiatement tous les sous-agents bloqués." },
  { cmd: '/budget ', desc: "Alloue un nombre maximum de tokens." },
  { cmd: '/cryptobiosis', desc: "Gèle l'essaim pour préserver l'état et le budget." },
  { cmd: '/redteam', desc: "Déploie un agent parasite pour auditer la solution." },
  { cmd: '/consolidate', desc: "Nettoie et consolide la mémoire vectorielle." },
  { cmd: '/hypermutation', desc: "Augmente la température créative." },
  { cmd: '/stigmergy', desc: "Active la coordination indirecte par traces." }
];

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTelemetry, setLiveTelemetry] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState('Personnalisé Moyen');
  const [slashMenuVisible, setSlashMenuVisible] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [gitStats, setGitStats] = useState({ additions: '+0', deletions: '-0', branch: 'main' });
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [autoApprove, setAutoApprove] = useState(false);

  const [workspaces, setWorkspaces] = useState<{active: string|null, list: string[]}>({active: null, list: []});
  const [conversations, setConversations] = useState<{id: string, title: string, updatedAt: number}[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTelemetry]);

  useEffect(() => {
    try {
      const electron = (window as any).require('electron');
      electron.ipcRenderer.invoke('list-workspaces').then(setWorkspaces).catch(() => {});
      electron.ipcRenderer.invoke('list-conversations').then(setConversations).catch(() => {});
      
      const fetchGitStats = () => {
        electron.ipcRenderer.invoke('get-git-stats').then((stats: any) => {
          if (stats) setGitStats(stats);
        }).catch(() => {});
      };
      fetchGitStats();
      const gitInterval = setInterval(fetchGitStats, 2000);
      electron.ipcRenderer.invoke('list-local-models').then((models: string[]) => {
        if (models?.length) {
          setLocalModels(models);
          setSelectedModel(models[0]);
        }
      }).catch(() => {});

      const handleStream = (_e: any, evtObj: any) => {
        setLiveTelemetry(prev => [...prev, evtObj].slice(-30));
      };
      electron.ipcRenderer.on('telemetry-stream', handleStream);
      return () => {
        electron.ipcRenderer.removeListener('telemetry-stream', handleStream);
        clearInterval(gitInterval);
      };
    } catch {
      // Outside Electron environment
    }
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    const saveConv = async () => {
      let id = currentConvId;
      let title = 'Nouvelle conversation';
      if (!id) {
        id = 'conv_' + Date.now();
        setCurrentConvId(id);
        title = messages[0].text.substring(0, 30);
      } else {
        const existing = conversations.find(c => c.id === id);
        title = existing ? existing.title : messages[0].text.substring(0, 30);
      }
      try {
        const electron = (window as any).require('electron');
        await electron.ipcRenderer.invoke('save-conversation', { id, title, messages });
        const list = await electron.ipcRenderer.invoke('list-conversations');
        if (list) setConversations(list);
      } catch {}
    };
    saveConv();
  }, [messages]);

  const handleAddWorkspace = async () => {
    try {
      const electron = (window as any).require('electron');
      const res = await electron.ipcRenderer.invoke('add-workspace');
      if (res) setWorkspaces(res);
    } catch {}
  };

  const handleSetActiveWorkspace = async (path: string) => {
    try {
      const electron = (window as any).require('electron');
      const res = await electron.ipcRenderer.invoke('set-active-workspace', path);
      if (res) setWorkspaces(res);
    } catch {}
  };

  const loadConversation = async (id: string) => {
    try {
      const electron = (window as any).require('electron');
      const res = await electron.ipcRenderer.invoke('load-conversation', id);
      if (res) {
        setCurrentConvId(res.id);
        setMessages(res.messages || []);
      }
    } catch {}
  };

  const handleNewChat = () => {
    setCurrentConvId(null);
    setMessages([]);
    setInputValue('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputValue(val);
    if (val.includes('/')) {
      const lastSlash = val.lastIndexOf('/');
      const after = val.substring(lastSlash + 1);
      if (!after.includes(' ')) {
        setSlashMenuVisible(true);
        setSlashFilter(after.toLowerCase());
        return;
      }
    }
    setSlashMenuVisible(false);
  };

  const handleCommandSelect = (cmd: string) => {
    const lastSlash = inputValue.lastIndexOf('/');
    setInputValue(inputValue.substring(0, lastSlash) + cmd + ' ');
    setSlashMenuVisible(false);
  };

  const handleSubmit = async () => {
    if (!inputValue.trim() || isProcessing) return;
    const userMsg: Message = { id: Date.now(), author: 'User', text: inputValue };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setIsProcessing(true);
    setLiveTelemetry([]);
    
    try {
      const electron = (window as any).require('electron');
      const payload = { text: userMsg.text, model: selectedModel, autoApprove };
      const response = await electron.ipcRenderer.invoke('ask-griot', payload);
      setMessages(prev => [...prev, { id: Date.now(), author: 'Griot', text: response || 'Agent done.' }]);
    } catch {
      setTimeout(() => {
        setMessages(prev => [...prev, { id: Date.now(), author: 'Griot', text: 'Opération terminée avec succès.' }]);
      }, 800);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderInputBox = () => (
    <div className="input-container-inner">
      <div className="complex-input-box">
        {slashMenuVisible && (
          <div className="slash-menu">
            {SLASH_COMMANDS.filter(c => c.cmd.substring(1).startsWith(slashFilter)).map(c => (
              <div key={c.cmd} className="slash-menu-item" onClick={() => handleCommandSelect(c.cmd)}>
                <span className="slash-cmd">{c.cmd}</span>
                <span className="slash-desc">{c.desc}</span>
              </div>
            ))}
          </div>
        )}
        <textarea
          className="main-textarea"
          placeholder="Que voulez-vous faire ?"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
            if (e.key === 'Escape') setSlashMenuVisible(false);
          }}
          disabled={isProcessing}
        />
        <div className="input-toolbar">
          <button className="tool-btn" type="button" title="Ajouter"><IconPlus /></button>
          <label className="toggle-approve">
            <input type="checkbox" checked={autoApprove} onChange={e => setAutoApprove(e.target.checked)} /> Approuver à ma place
          </label>
          <div className="spacer" />
          <select className="model-selector" value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
            {localModels.length > 0 ? (
              localModels.map(m => <option key={m} value={m}>{m}</option>)
            ) : (
              <option value="Personnalisé Moyen">Personnalisé Moyen</option>
            )}
          </select>
          <button className="tool-btn" type="button" title="Vocal"><IconMic /></button>
          <button className="send-btn" type="button" onClick={handleSubmit} disabled={isProcessing || !inputValue.trim()}>
            <IconArrowUp />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header"><span>Griot</span></div>
        <div className="sidebar-nav">
          <div className="nav-item active" onClick={handleNewChat}>
            <IconChat /> Nouveau chat
          </div>
        </div>
        <div className="sidebar-scroll">
          <div className="sidebar-section">
            <div className="sidebar-title">
              WORKSPACES 
              <div className="sidebar-title-action" onClick={handleAddWorkspace}><IconPlus /></div>
            </div>
            {workspaces.list.map(w => (
              <div 
                key={w} 
                className={`project-folder ${w === workspaces.active ? 'active' : ''}`}
                onClick={() => handleSetActiveWorkspace(w)}
                title={w}
              >
                <IconFolder /> {w.split(/[/\\]/).pop()}
              </div>
            ))}
          </div>
          <div className="sidebar-section">
            <div className="sidebar-title">HISTORIQUE</div>
            {conversations.map(c => (
              <div 
                key={c.id} 
                className={`conversation-item ${c.id === currentConvId ? 'active' : ''}`}
                onClick={() => loadConversation(c.id)}
                title={c.title}
              >
                <IconChat /> {c.title}
              </div>
            ))}
          </div>
        </div>
        <div className="sidebar-footer">
          <div className="user-profile"><div className="avatar">L</div> Utilisateur Local</div>
        </div>
      </aside>

      <main className="main-content">
        <header className="main-header">
          <div className="header-pill">
            <IconFolder /> 
            {workspaces.active ? workspaces.active.split(/[/\\]/).pop() : 'Griot Workspace'}
          </div>
          <div className="header-actions">
            <div className="header-action-item"><IconShare /> Partager</div>
            <div className="header-action-item"><IconLayout /></div>
          </div>
        </header>

        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><IconCloud /></div>
            <h2>Que voulez-vous créer ?</h2>
            <div className="input-wrapper-centered">{renderInputBox()}</div>
          </div>
        ) : (
          <div className="chat-area">
            <div className="chat-container">
              {messages.map((msg) => {
                if (msg.author === 'User') {
                  return (
                    <div key={msg.id} className="message user">
                      <div className="user-bubble">{msg.text}</div>
                    </div>
                  );
                }
                const parsed = parseGriotResponse(msg.text);
                return (
                  <div key={msg.id} className="message griot">
                    <div className="griot-content">
                      <GriotExecutionHeader data={parsed.data} duration={parsed.duration} />
                      <div className="griot-body">
                        <MessageWithActions text={parsed.prefix} />
                      </div>
                    </div>
                  </div>
                );
              })}
              {isProcessing && (
                <div className="message griot">
                  <div className="griot-content">
                    <details className="execution-header" open>
                      <summary className="execution-summary">
                        <span className="pulse-dot" />
                        <span className="execution-title">Exécution en cours... ({liveTelemetry.length} événements)</span>
                        <svg className="execution-chevron open" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                      </summary>
                      <div className="execution-body">
                        <div className="timeline-container" style={{ maxHeight: '180px' }}>
                          {liveTelemetry.map((t, idx) => (
                             <div key={idx} className="timeline-item">
                               <span className="timeline-detail">
                                 {typeof t === 'string' ? t : (t.type ? `[${t.type}] ${t.content || t.action || ''}` : JSON.stringify(t))}
                               </span>
                             </div>
                           ))}
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className="input-wrapper-fixed">{renderInputBox()}</div>
          </div>
        )}
      </main>

      <aside className="right-sidebar">
        <div className="rs-section">
          <div className="rs-header">Environnement <IconPlus /></div>
          <div className="rs-item"><div className="rs-item-left"><IconFolder /> Modifications</div> <span className="rs-badge-green">{gitStats.additions}</span> <span className="rs-badge-red">{gitStats.deletions}</span></div>
          <div className="rs-item"><div className="rs-item-left"><IconCode /> Local</div> <IconArrowUp /></div>
          <div className="rs-item"><div className="rs-item-left"><IconGitBranch /> {gitStats.branch}</div> <IconArrowUp /></div>
        </div>
      </aside>
    </div>
  );
}