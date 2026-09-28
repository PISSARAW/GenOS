import fs from 'fs';

let msg = fs.readFileSync(0, 'utf-8');
if (!msg) process.exit(0);

const translate = (text) => {
    let t = text;
    t = t.replace("Protocole de test empirique", "Empirical test protocol");
    t = t.replace("pour les Concepts", "for Concepts");
    t = t.replace("ajout du Lot", "Add Lot");
    t = t.replace("concepts nouvellement impl??ment??s", "newly implemented concepts");
    t = t.replace("concepts nouvellement implémentés", "newly implemented concepts");
    t = t.replace("ajout des explications sur", "Add explanations on");
    t = t.replace("Int??gration de la validation empirique", "Integrate empirical validation");
    t = t.replace("Intégration de la validation empirique", "Integrate empirical validation");
    t = t.replace("et du protocole de test pour Agent IA", "and test protocol for AI Agent");
    return t;
};

let lines = msg.split('\n');
let title = lines[0] || '';
let bracket = title.match(/^\[([A-Za-z]+)\]\s*(.*)$/);
if (bracket) {
    let tag = bracket[1].toUpperCase();
    let rest = translate((bracket[2] || '').trim());
    lines[0] = rest ? `[${tag}] ${rest}` : `[${tag}]`;
} else {
    let match = title.match(/^(feat|fix|docs|chore|refactor|test|style|perf|build|ci)(?:\([^)]+\))?:\s*(.*)/i);
    if (match) {
        let kind = match[1].toUpperCase();
        let new_title = translate((match[2] || '').trim());
        lines[0] = new_title ? `[${kind}] ${new_title}` : `[${kind}]`;
    }
}

process.stdout.write(lines.join('\n'));
