import React, { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Terminal, Copy, Trash2, Power, Search } from 'lucide-react';
import { api } from '../api/client';
import { useToastStore } from '../store/useToastStore';
import './CommandPalette.css';

interface CommandPaletteProps {
  onOpenChange?: (open: boolean) => void;
}

export function CommandPalette({ onOpenChange }: CommandPaletteProps) {
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
      await api.sendCommand(action);
      showToast('success', 'Command Dispatched', `Executed ${label}`);
    } catch (e: any) {
      showToast('error', 'Command Failed', e.message);
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
            <Command.Item className="command-palette-item" onSelect={() => handleCommand('fork_agent', '/fork agent')}>
              <Copy size={16} className="command-icon" />
              <span>/fork agent</span>
              <span className="command-shortcut">Ctrl F</span>
            </Command.Item>
            <Command.Item className="command-palette-item danger" onSelect={() => handleCommand('kill_agent', '/kill agent')}>
              <Trash2 size={16} className="command-icon" />
              <span>/kill agent</span>
              <span className="command-shortcut">Ctrl X</span>
            </Command.Item>
            <Command.Item className="command-palette-item" onSelect={() => handleCommand('inspect_state', '/inspect state')}>
              <Terminal size={16} className="command-icon" />
              <span>/inspect state</span>
            </Command.Item>
          </Command.Group>

          <Command.Group heading="System" className="command-palette-group">
            <Command.Item className="command-palette-item" onSelect={() => handleCommand('reboot_studio', 'Reboot Studio')}>
              <Power size={16} className="command-icon" />
              <span>Reboot Studio</span>
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </div>
  );
}
