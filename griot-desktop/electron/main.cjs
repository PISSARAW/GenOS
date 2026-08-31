const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { spawn, exec } = require('child_process');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    title: "Griot - Local Cognitive Node"
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5180');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  const template = [
    {
      label: 'Affichage',
      submenu: [
        {
          label: 'Afficher la telemetrie',
          type: 'checkbox',
          checked: true,
          click: (menuItem) => {
            if (mainWindow) {
              mainWindow.webContents.send('toggle-telemetry', menuItem.checked);
            }
          }
        }
      ]
    },
    {
      label: 'Fenetre',
      submenu: [
        { role: 'reload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Fonction utilitaire pour Apoptosis (Tuer les agents dans la DB via le backend)
ipcMain.handle('trigger-apoptosis', async () => {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '../../backend/bin/genos-apoptosis.cjs');
    exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
      if (error) {
        resolve(`Erreur lors de l'apoptosis: ${stderr || error.message}`);
      } else {
        resolve(stdout.trim());
      }
    });
  });
});

// Fetch recent tasks from SQLite via background script
ipcMain.handle('list-recent-tasks', async () => {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '../../backend/bin/genos-recent-tasks.cjs');
    exec(`node "${scriptPath}"`, (error, stdout) => {
      try {
        const tasks = JSON.parse(stdout.trim());
        resolve(tasks);
      } catch (e) {
        resolve([]);
      }
    });
  });
});

// Workspaces & Conversations Managers
const { getWorkspaces, addWorkspace, setActiveWorkspace } = require('./workspaceManager.cjs');
const { listConversations, saveConversation, loadConversation } = require('./conversationManager.cjs');

ipcMain.handle('list-workspaces', async () => getWorkspaces());
ipcMain.handle('add-workspace', async () => await addWorkspace());
ipcMain.handle('set-active-workspace', async (e, wp) => setActiveWorkspace(wp));

ipcMain.handle('list-conversations', async () => listConversations());
ipcMain.handle('save-conversation', async (e, conv) => saveConversation(conv));
ipcMain.handle('load-conversation', async (e, id) => loadConversation(id));

// Fetch git stats for the current GenOS project
ipcMain.handle('get-git-stats', async () => {
  return new Promise((resolve) => {
    const active = getWorkspaces().active;
    const targetDir = active || path.join(__dirname, '../../'); // Fallback to GenOS root
    exec(`git diff HEAD --shortstat`, { cwd: targetDir }, (err, stdout) => {
      let additions = 0;
      let deletions = 0;
      if (stdout) {
        const addMatch = stdout.match(/(\d+)\s+insertion/);
        const delMatch = stdout.match(/(\d+)\s+deletion/);
        if (addMatch) additions = parseInt(addMatch[1], 10);
        if (delMatch) deletions = parseInt(delMatch[1], 10);
      }
      exec(`git branch --show-current`, { cwd: targetDir }, (err2, branchOut) => {
        resolve({ 
          additions: additions > 0 ? `+${additions}` : '+0', 
          deletions: deletions > 0 ? `-${deletions}` : '-0',
          branch: branchOut.trim() || 'main'
        });
      });
    });
  });
});

// Fetch real local models from localModelDiscovery.js
ipcMain.handle('list-local-models', async () => {
  try {
    const { discoverLocalModels } = require(path.join(__dirname, '../../backend/src/services/localModelDiscovery.js'));
    const models = await discoverLocalModels();
    return models.filter(m => m.chatCapable).map(m => m.model);
  } catch (e) {
    console.error(e);
    return [];
  }
});

ipcMain.handle('ask-griot', async (event, requestData) => {
  return new Promise((resolve, reject) => {
    // Si la donnée est un objet (nouveau format), on extrait le texte et le modèle
    const isObj = typeof requestData === 'object' && requestData !== null;
    const promptText = isObj ? requestData.text : requestData;
    const model = isObj ? requestData.model : 'standard';

    const backendScript = path.join(__dirname, '../../backend/bin/genos-orchestrate.cjs');
    
    const payload = JSON.stringify({
      action: 'orchestrate',
      orchestratorId: `griot_orchestrator_${Date.now()}`,
      mission: promptText,
      allowed_commands: [],
      allow_file_edits: false,
      model_tier: model
    });

    let output = '';
    let streamBuffer = '';
    
    const active = getWorkspaces().active;
    const targetCwd = active || path.join(__dirname, '../../');

    const child = spawn('node', [backendScript, payload], {
      cwd: targetCwd,
      env: { 
        ...process.env, 
        GENOS_STREAM_TELEMETRY: '1',
        GENOS_AGENT_EXECUTOR: path.join(__dirname, '../../backend/bin/local-codex-runtime.cjs')
      }
    });

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      streamBuffer += chunk;
      
      let newlineIdx;
      while ((newlineIdx = streamBuffer.indexOf('\n')) !== -1) {
        const line = streamBuffer.substring(0, newlineIdx).trim();
        streamBuffer = streamBuffer.substring(newlineIdx + 1);
        
        if (line.startsWith('GENOS_STREAM:')) {
          try {
            const evtObj = JSON.parse(line.substring(13));
            if (mainWindow) {
              mainWindow.webContents.send('telemetry-stream', evtObj);
            }
          } catch(e) {}
        }
      }
    });

    child.stderr.on('data', (data) => {
      console.error(`Griot stderr: ${data}`);
    });

    child.on('close', (code) => {
      if (code !== 0 && output.trim() === '') {
        resolve(`Erreur: Processus terminé avec le code ${code}`);
      } else {
        resolve(output.trim() || 'Griot a terminé la tâche mais n\'a pas retourné de texte.');
      }
    });
  });
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});