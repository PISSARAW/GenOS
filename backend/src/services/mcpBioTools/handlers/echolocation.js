async function handleEcholocationListen(..._args) {
  const [args, cp, getDatabase, run] = _args;

  const path = require('path');
  const scriptPath = path.resolve(process.cwd(), 'examples/griot-daemon/griot_ear.py');
  if (echolocationProcess && !echolocationProcess.killed) {
    return { configured: true, success: true, status: 'completed', transport: 'local', output: "Oreille de Griot déjà active." };
  }
  echolocationProcess = cp.spawn('python', [scriptPath], { detached: true, stdio: 'ignore' });
  echolocationProcessId = `echolocation-${echolocationProcess.pid}-${Date.now()}`;
  const trackingDb = await getDatabase();
  await trackingDb.exec(`CREATE TABLE IF NOT EXISTS detached_processes (id TEXT PRIMARY KEY, pid INTEGER NOT NULL, kind TEXT NOT NULL, owner_id TEXT, command TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await trackingDb.run('INSERT INTO detached_processes (id, pid, kind, owner_id, command) VALUES (?, ?, ?, ?, ?)', echolocationProcessId, echolocationProcess.pid, 'echolocation', null, 'python');
  echolocationProcess.once('exit', () => {
    const completedId = echolocationProcessId;
    echolocationProcess = null;
    echolocationProcessId = null;
    if (completedId) getDatabase().then((db) => db.run('DELETE FROM detached_processes WHERE id = ?', completedId)).catch(() => {});
  });
  echolocationProcess.unref();
  return { configured: true, success: true, status: 'completed', transport: 'local', output: "Oreille de Griot activée. Mode écoute en arrière-plan (Autopoïèse complète)." };
}

function handleEcholocationBeep(args, cp, run) {
  const frequency = Number(args.freq ?? 440);
  const duration = Number(args.duration ?? 500);
  if (!Number.isFinite(frequency) || !Number.isFinite(duration) || frequency <= 0 || duration <= 0) {
    throw new Error('Echolocation frequency and duration must be positive numbers.');
  }
  const processEnvironment = {};
  for (const name of ['PATH', 'PATHEXT', 'ComSpec', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE']) {
    if (process.env[name]) processEnvironment[name] = process.env[name];
  }
  cp.spawnSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    '[System.Console]::Beep([double]$env:GENOS_BEEP_FREQUENCY, [int]$env:GENOS_BEEP_DURATION)'
  ], {
    env: { ...processEnvironment, GENOS_BEEP_FREQUENCY: String(frequency), GENOS_BEEP_DURATION: String(duration) },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  const out = run(`genos biomimicry echolocation --freq ${frequency}`);
  return { configured: true, success: true, status: 'completed', transport: 'local', output: out.toString() };
}

function handleEcholocationError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
}

let echolocationProcess = null;
let echolocationProcessId = null;

module.exports = { handleEcholocationListen, handleEcholocationBeep, handleEcholocationError, get echolocationProcess() { return echolocationProcess; }, set echolocationProcess(v) { echolocationProcess = v; }, get echolocationProcessId() { return echolocationProcessId; }, set echolocationProcessId(v) { echolocationProcessId = v; } };
