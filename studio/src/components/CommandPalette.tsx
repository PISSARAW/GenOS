import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Terminal, Search, Ban, Navigation } from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';
import { STUDIO_VIEWS, type StudioView } from '../views';
import './CommandPalette.css';

interface CommandPaletteProps {
  onOpenChange?: (open: boolean) => void;
  onNavigate?: (view: string) => void;
}

export function CommandPalette({ onOpenChange, onNavigate }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const showToast = useToastStore((state) => state.showToast);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((openState) => {
          const newState = !openState;
          if (onOpenChange) onOpenChange(newState);
          return newState;
        });
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [onOpenChange]);

  const handleCommand = async (action: string, label: string) => {
    setOpen(false);
    try {
      const result = await api.sendCommand(action);
      showToast('success', 'Command Completed', result.message || label);
    } catch (e: any) {
      showToast('error', 'Command Failed', e.message);
    }
  };

  const handleHaltAll = async () => {
    if (!window.confirm('Halt all MCP tools? New MCP tool invocations will be blocked.')) {
      return;
    }
    setOpen(false);
    try {
      await api.haltAll();
      showToast('warning', 'MCP KILL SWITCH ENGAGED', 'New MCP tool invocations are blocked.');
    } catch (e: any) {
      showToast('error', 'Halt Failed', e.message);
    }
  };

  if (!open) return null;

  return (
    <div className="command-palette-overlay" onClick={() => setOpen(false)}>
      <Command.Dialog 
        open={open} 
        onOpenChange={setOpen} 
        className="command-palette-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="command-palette-header">
          <Search className="command-search-icon" size={18} />
          <Command.Input 
            autoFocus 
            placeholder="Type a command or search..." 
            className="command-palette-input"
          />
        </div>

        <Command.List className="command-palette-list">
          <Command.Empty className="command-palette-empty">No results found.</Command.Empty>
          
          <Command.Group heading="Agent Actions" className="command-palette-group">
            <Command.Item className="command-palette-item" onSelect={() => handleCommand('inspect_state', '/inspect state')}>
              <Terminal size={16} className="command-icon" />
              <span>/inspect state</span>
            </Command.Item>
            <Command.Item className="command-palette-item" onSelect={() => { void handleHaltAll(); }}>
              <Ban size={16} className="command-icon" />
              <span>Halt all MCP tools</span>
            </Command.Item>
          </Command.Group>

          <Command.Group heading="Navigation" className="command-palette-group">
            {(Object.entries(STUDIO_VIEWS) as Array<[StudioView, string]>).map(([view, label]) => (
              <Command.Item
                key={view}
                className="command-palette-item"
                onSelect={() => {
                  setOpen(false);
                  if (onNavigate) onNavigate(view);
                }}
              >
                <Navigation size={16} className="command-icon" />
                <span>{`Go to ${label}`}</span>
              </Command.Item>
            ))}
          </Command.Group>

        </Command.List>
      </Command.Dialog>
    </div>
  );
}
