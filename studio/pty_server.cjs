const os = require('os');
const pty = require('node-pty');
const { WebSocketServer } = require('ws');

const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

const ptyProcess = pty.spawn(shell, [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.cwd(),
  env: process.env
});

const wss = new WebSocketServer({ port: 3002, path: '/pty' });
console.log('PTY Server listening on ws://localhost:3002/pty');

wss.on('connection', (ws) => {
  console.log('Client connected to PTY shell');
  
  const onData = ptyProcess.onData((data) => {
    ws.send(data);
  });

  ws.on('message', (msg) => {
    ptyProcess.write(msg.toString());
  });

  ws.on('close', () => {
    console.log('Client disconnected from PTY');
    onData.dispose();
  });
});
