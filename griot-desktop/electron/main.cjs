const { app, BrowserWindow, ipcMain } = require('electron');
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
    title: "Griot - Local Cognitive Node",
    autoHideMenuBar: true
  });

  const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';
  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5180');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

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
      orchestratorId: 'griot_orchestrator',
      mission: promptText,
      allowed_commands: [],
      allow_file_edits: false
    });

    let output = '';
    const child = spawn('node', [backendScript, payload]);

    child.stdout.on('data', (data) => {
      output += data.toString();
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
