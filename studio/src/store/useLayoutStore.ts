import { create } from 'zustand';

export type WorkspaceType = 'MCTS_TOPOLOGY' | 'LOGS_TERMINAL';

interface LayoutState {
  activeWorkspace: WorkspaceType;
  setActiveWorkspace: (workspace: WorkspaceType) => void;
  
  floatingWindows: string[];
  openFloatingWindow: (id: string) => void;
  closeFloatingWindow: (id: string) => void;
  toggleFloatingWindow: (id: string) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  activeWorkspace: 'MCTS_TOPOLOGY',
  setActiveWorkspace: (workspace) => set({ activeWorkspace: workspace }),
  
  floatingWindows: [],
  openFloatingWindow: (id) => set((state) => ({
    floatingWindows: state.floatingWindows.includes(id) 
      ? state.floatingWindows 
      : [...state.floatingWindows, id]
  })),
  closeFloatingWindow: (id) => set((state) => ({
    floatingWindows: state.floatingWindows.filter(winId => winId !== id)
  })),
  toggleFloatingWindow: (id) => set((state) => ({
    floatingWindows: state.floatingWindows.includes(id)
      ? state.floatingWindows.filter(winId => winId !== id)
      : [...state.floatingWindows, id]
  }))
}));
