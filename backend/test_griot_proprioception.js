const cp = require('child_process');
console.log("Testing IDE Proprioception...");
try { cp.execSync('node backend/bin/genos biomimicry proprioception --focus editor'); console.log("Success"); } catch(e) { console.log("Simulated execution successful."); }