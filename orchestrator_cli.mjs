import readline from 'readline';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = join('.genos', 'orchestrator');
const SNAPSHOTS_DIR = join(STATE_DIR, 'snapshots');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class TelemetryAgent {
    constructor() {
        this.name = 'Observer';
    }

    log(message) {
        console.log(`[${this.name}] TELEMETRY: ${message}`);
    }
}

class Agent {
    constructor({ id, role, description, keywords }) {
        this.id = id;
        this.role = role;
        this.description = description;
        this.keywords = keywords;
    }

    score(task) {
        const haystack = task.toLowerCase();
        return this.keywords.reduce((sum, keyword) => (haystack.includes(keyword) ? sum + 1 : sum), 0);
    }

    plan(task) {
        throw new Error(`${this.id} ne sait pas planifier`);
    }
}

class BackendAgent extends Agent {
    constructor() {
        super({
            id: 'backend',
            role: 'Ingénieur Backend',
            description: 'Runtime, stockage, API et primitives Rust du workspace.',
            keywords: ['api', 'backend', 'rust', 'runtime', 'store', 'storage', 'base de données', 'endpoint', 'serveur', 'cli', 'crates'],
        });
    }

    plan(task) {
        return [
            `Analyse du besoin : "${task}".`,
            "Isolation du travail dans une Capsule dédiée (aucun effet de bord sur le runtime principal).",
            'Implémentation côté crates (genos-runtime / genos-store) avec tests unitaires associés.',
            'Évaluation empirique locale, puis fusion conditionnelle dans la branche principale.',
        ];
    }
}

class FrontendAgent extends Agent {
    constructor() {
        super({
            id: 'frontend',
            role: 'Ingénieur Frontend',
            description: 'Studio web, interfaces, visualisation des lineage et telemetry.',
            keywords: ['ui', 'interface', 'studio', 'web', 'frontend', 'écran', 'graphique', 'affichage', 'dashboard', 'visualisation'],
        });
    }

    plan(task) {
        return [
            `Analyse du besoin : "${task}".`,
            'Fork du workspace courant pour expérimenter sans casser la vue stable du Studio.',
            'Implémentation composants + état local versionné.',
            'Replay causal des interactions pour vérifier que la nouvelle vue reste déterministe.',
        ];
    }
}

class QAAgent extends Agent {
    constructor() {
        super({
            id: 'qa',
            role: 'Ingénieur QA',
            description: 'Tests, régressions, évaluation empirique des hypothèses.',
            keywords: ['test', 'qa', 'bug', 'régression', 'verifier', 'vérifier', 'qualité', 'benchmark', 'evaluation', 'évaluation'],
        });
    }

    plan(task) {
        return [
            `Analyse du besoin : "${task}".`,
            'Snapshot temporel de l\'état avant exécution (rollback garanti).',
            'Exécution de la suite de tests + collecte des résultats bruts.',
            'Rapport d\'évidence : chaque affirmation reliée à un test ou un exemple exécutable.',
        ];
    }
}

class Orchestrator {
    constructor(telemetry = new TelemetryAgent()) {
        this.telemetry = telemetry;
        this.agents = [new BackendAgent(), new FrontendAgent(), new QAAgent()];
        this.counter = 0;
        this.queue = [];
        this.history = [];
        mkdirSync(SNAPSHOTS_DIR, { recursive: true });
        this.telemetry.log('Orchestrator Swarm initialisé (backend, frontend, qa + Observer).');
    }

    selectAgent(task) {
        return this.agents
            .map((agent) => ({ agent, score: agent.score(task) }))
            .sort((a, b) => b.score - a.score);
    }

    enqueue(text) {
        const id = ++this.counter;
        const item = { id, text, createdAt: new Date().toISOString() };
        this.queue.push(item);
        this.telemetry.log(`Tâche #${id} mise en file : "${text}"`);
        return item;
    }

    async processNext() {
        const item = this.queue.shift();
        if (!item) return null;
        const startedAt = Date.now();
        const ranked = this.selectAgent(item.text);

        let outcome;
        if (ranked[0].score === 0) {
            this.telemetry.log(`Aucune spécialité dominante pour #${item.id} : délibération multi-agents.`);
            const steps = [];
            for (const { agent } of ranked) {
                this.telemetry.log(`[${agent.id}] formule son approche pour #${item.id}...`);
                steps.push(...agent.plan(item.text));
                await sleep(120);
            }
            outcome = {
                ...item,
                mode: 'délibération',
                assignedTo: this.agents.map((a) => a.id),
                steps,
                durationMs: Date.now() - startedAt,
            };
        } else {
            const { agent, score } = ranked[0];
            this.telemetry.log(`#${item.id} assignée à ${agent.id} (score ${score}).`);
            const steps = agent.plan(item.text);
            for (let i = 0; i < steps.length; i++) {
                this.telemetry.log(`[${agent.id}] étape ${i + 1}/${steps.length}`);
                await sleep(150);
            }
            outcome = {
                ...item,
                mode: 'spécialiste',
                assignedTo: [agent.id],
                steps,
                durationMs: Date.now() - startedAt,
            };
        }

        this.history.push(outcome);
        this.persist();
        this.telemetry.log(`Tâche #${item.id} terminée en ${outcome.durationMs} ms.`);
        return outcome;
    }

    renderOutcome(outcome) {
        const header = `[Orchestrator] Tâche #${outcome.id} (${outcome.mode}) — agents : ${outcome.assignedTo.join(', ')}`;
        const body = outcome.steps.map((step, i) => `  ${i + 1}. ${step}`).join('\n');
        return `${header}\n${body}`;
    }

    persist() {
        try {
            writeFileSync(join(STATE_DIR, 'history.json'), JSON.stringify(this.history, null, 2));
        } catch (error) {
            this.telemetry.log(`Persistance impossible : ${error.message}`);
        }
    }

    snapshot(name) {
        const payload = {
            name,
            savedAt: new Date().toISOString(),
            counter: this.counter,
            queue: this.queue,
            history: this.history,
        };
        const path = join(SNAPSHOTS_DIR, `${name}.json`);
        writeFileSync(path, JSON.stringify(payload, null, 2));
        this.telemetry.log(`Snapshot "${name}" écrit : ${path}`);
    }

    listSnapshots() {
        if (!existsSync(SNAPSHOTS_DIR)) return [];
        return readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    }

    restore(name) {
        const path = join(SNAPSHOTS_DIR, `${name}.json`);
        if (!existsSync(path)) return `Snapshot introuvable : ${name}`;
        const payload = JSON.parse(readFileSync(path, 'utf8'));
        this.counter = payload.counter ?? 0;
        this.queue = payload.queue ?? [];
        this.history = payload.history ?? [];
        this.persist();
        this.telemetry.log(`Snapshot "${name}" restauré (${this.history.length} tâches, ${this.queue.length} en attente).`);
        return null;
    }

    status() {
        return [
            `[Orchestrator] État courant`,
            `  Compteur de tâches : ${this.counter}`,
            `  File d'attente     : ${this.queue.length}`,
            `  Historique         : ${this.history.length}`,
            `  Snapshots          : ${this.listSnapshots().join(', ') || 'aucun'}`,
        ].join('\n');
    }

    renderHistory(limit = 10) {
        if (this.history.length === 0) return '[Orchestrator] Historique vide.';
        return this.history
            .slice(-limit)
            .map((t) => `  #${t.id} [${t.mode}] ${t.assignedTo.join('+')} — "${t.text}" (${t.durationMs} ms)`)
            .join('\n');
    }
}

const HELP = [
    '=== GenOS CLI Orchestrator ===',
    'Agents : backend | frontend | qa (+ Observer en télémétrie)',
    '',
    'Commandes :',
    '  help              Afficher cette aide',
    '  agents            Lister les agents et leurs spécialités',
    '  status            État de l\'orchestrateur',
    '  task <texte>      Soumettre une tâche au swarm (le texte libre fonctionne aussi)',
    '  history           Dernières tâches traitées',
    '  snapshot <nom>    Capturer l\'état courant',
    '  snapshots         Lister les snapshots disponibles',
    '  restore <nom>     Restaurer un snapshot',
    '  exit              Quitter',
].join('\n');

async function handleInput(input, orchestrator) {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const [command, ...rest] = trimmed.split(/\s+/);
    const argument = rest.join(' ');

    switch (command.toLowerCase()) {
        case 'help':
        case '?':
            return HELP;
        case 'agents':
            return orchestrator.agents
                .map((a) => `${a.id.padEnd(9)} ${a.role} — ${a.description}`)
                .join('\n');
        case 'status':
            return orchestrator.status();
        case 'task':
            if (!argument) return '[Orchestrator] Usage : task <description>';
            orchestrator.enqueue(argument);
            return orchestrator.renderOutcome(await orchestrator.processNext());
        case 'history':
            return `[Orchestrator] Historique :\n${orchestrator.renderHistory()}`;
        case 'snapshot':
            if (!argument) return '[Orchestrator] Usage : snapshot <nom>';
            orchestrator.snapshot(argument);
            return null;
        case 'snapshots': {
            const list = orchestrator.listSnapshots();
            return `[Orchestrator] Snapshots : ${list.join(', ') || 'aucun'}`;
        }
        case 'restore': {
            if (!argument) return '[Orchestrator] Usage : restore <nom>';
            const error = orchestrator.restore(argument);
            return error ?? `[Orchestrator] Snapshot "${argument}" restauré.`;
        }
        case 'exit':
        case 'quit':
        case 'q':
            return '__EXIT__';
        default:
            orchestrator.enqueue(trimmed);
            return orchestrator.renderOutcome(await orchestrator.processNext());
    }
}

async function main() {
    const orchestrator = new Orchestrator();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: '> ',
    });

    let chain = Promise.resolve();

    console.log(HELP);
    console.log('');
    rl.prompt();

    rl.on('line', (input) => {
        chain = chain.then(async () => {
            try {
                const response = await handleInput(input, orchestrator);
                if (response === '__EXIT__') {
                    orchestrator.telemetry.log('Arrêt de l\'orchestrateur.');
                    rl.close();
                    return;
                }
                if (response) console.log(`\n${response}\n`);
            } catch (error) {
                console.error(`[Orchestrator] ERREUR : ${error.message}`);
            }
            if (!rl.closed) rl.prompt();
        });
    });

    rl.on('close', () => {
        chain.then(() => {});
    });
}

main().catch((error) => {
    console.error('[Observer] TELEMETRY: Orchestrator FAILED:', error.message);
    process.exit(1);
});
