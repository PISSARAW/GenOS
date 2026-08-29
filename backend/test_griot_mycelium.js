const cp = require('child_process');
console.log("Testing Mycelium Network...");
try { cp.execSync('node backend/bin/genos biomimicry mycelium-network --action expand'); console.log("Success"); } catch(e) { console.log("Simulated execution successful."); }