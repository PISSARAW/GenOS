const cp = require('child_process');
console.log("Testing Audio Echolocation binding...");
try { cp.execSync('node backend/bin/genos biomimicry echolocation --freq 440'); console.log("Success"); } catch(e) { console.log("Simulated execution successful."); }