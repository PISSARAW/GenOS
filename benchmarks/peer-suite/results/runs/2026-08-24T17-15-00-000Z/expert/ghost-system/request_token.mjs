import fs from 'node:fs';

console.log("Requesting token... This may take a while in the background.");

setTimeout(() => {
    fs.writeFileSync('token.txt', 'TOKEN_9988776655');
    setTimeout(() => {
        try {
            fs.unlinkSync('token.txt');
        } catch (e) {}
    }, 10000);
}, 30000);

console.log(`Process started in background (PID ${process.pid}). Keep this running.`);
