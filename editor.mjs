import fs from 'fs';
let file = process.argv[2];
let content = fs.readFileSync(file, 'utf8');
fs.writeFileSync('rebase_todo.log', content);
content = content.replace(/pick 01fbb98.*/, 'edit 01fbb98');
fs.writeFileSync(file, content);
