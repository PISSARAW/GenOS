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

// Lecture du filesystem pour les projets (Sidebar)
ipcMain.handle('list-github-projects', async () => {
  try {
    const fs = require('fs');
    const ghPath = path.join(process.env.USERPROFILE || 'C:\\Users\\Shadow', 'Documents', 'GitHub');
    if (fs.existsSync(ghPath)) {
      return fs.readdirSync(ghPath, { withFileTypes: true })
               .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
               .map(dirent => dirent.name);
    }
    return ['Banini', 'Exocompute', 'GenOS']; // Fallback
  } catch (err) {
    return ['Banini', 'Exocompute', 'GenOS'];
  }
});

// Fetch git stats for the current GenOS project
ipcMain.handle('get-git-stats', async () => {
  return new Promise((resolve) => {
    const targetDir = path.join(__dirname, '../../'); // GenOS root
    exec(`git status --porcelain`, { cwd: targetDir }, (err, stdout) => {
      const lines = stdout.trim().split('\n').filter(Boolean);
      const additions = lines.filter(l => l.startsWith('A') || l.startsWith('M') || l.startsWith('??')).length;
      const deletions = lines.filter(l => l.startsWith('D')).length;
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
    
    const child = spawn('node', [backendScript, payload], {
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