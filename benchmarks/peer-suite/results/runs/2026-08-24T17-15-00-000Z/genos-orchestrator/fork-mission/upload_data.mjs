import fs from 'node:fs';

const token = process.argv[2];
const file = process.argv[3];

if (!token || !file) {
    console.error("Usage: node upload_data.mjs <token> <file.json>");
    process.exit(1);
}

try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const users = data.users || [];
    
    let allLowercase = true;
    for (const u of users) {
        if (u.email && u.email !== u.email.toLowerCase()) {
            allLowercase = false;
        }
    }
    
    if (allLowercase && users.length > 0) {
        fs.writeFileSync('.api_state.json', JSON.stringify({ inserted: users.length }));
        console.log(JSON.stringify({ status: 'success', data_inserted: users.length, message: 'OK' }));
    } else {
        fs.writeFileSync('.api_state.json', JSON.stringify({ inserted: 0 }));
        console.log(JSON.stringify({ status: 'success', data_inserted: 0, warning: 'schema mismatch - payload dropped' }));
    }
} catch (e) {
    console.error(JSON.stringify({ status: 'error', message: 'Invalid JSON' }));
    process.exit(1);
}
