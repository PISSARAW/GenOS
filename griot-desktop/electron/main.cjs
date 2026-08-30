const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

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

ipcMain.handle('ask-griot', async (event, promptText) => {
  return new Promise((resolve, reject) => {
    // Le chemin vers le backend GenOS est un niveau au-dessus du dossier griot-desktop
    const backendScript = path.join(__dirname, '../../backend/bin/genos-orchestrate.cjs');
    
    const payload = JSON.stringify({
      action: 'orchestrate',
      orchestratorId: `griot_orchestrator_${Date.now()}`,
      mission: promptText,
      allowed_commands: [],
      allow_file_edits: false
    });

    let output = '';
    let streamBuffer = '';
    
    const child = spawn('node', [backendScript, payload], {
      env: { ...process.env, GENOS_STREAM_TELEMETRY: '1' }
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
