import readline from 'readline';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STATE_DIR = join('.genos', 'orchestrator');
const SNAPSHOTS_DIR = join(STATE_DIR, 'snapshots');
const MAX_SLOTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class ParkingLot {
    constructor() {
        this.parked = [];
    }

    park(slot) {
        const entry = { ...slot, parkedAt: new Date().toISOString() };
        this.parked.push(entry);
        return entry;
    }

    wake(agentId) {
        const idx = this.parked.findIndex((s) => s.agentId === agentId);
        if (idx === -1) return null;
        const [entry] = this.parked.splice(idx, 1);
        return entry;
    }

    bestMatch(task) {
        if (this.parked.length === 0) return null;
        const haystack = task.toLowerCase();
        let best = null;
        let bestScore = -1;
        for (const entry of this.parked) {
            const score = entry.keywords.reduce((s, k) => (haystack.includes(k) ? s + 1 : s), 0);
            if (score > bestScore) { bestScore = score; best = entry; }
        }
        return bestScore > 0 ? best : null;
    }
}

class TelemetryAgent {
    log(message) { console.log(`[Observer] TELEMETRY: ${message}`); }
}

class Agent {
    constructor({ id, role, description, keywords }) {
        Object.assign(this, { id, role, description, keywords });
    }
    score(task) {
        const h = task.toLowerCase();
        return this.keywords.reduce((s, k) => (h.includes(k) ? s + 1 : s), 0);
    }
    plan(_task) { throw new Error(`${this.id} ne sait pas planifier`); }
}

class BackendAgent extends Agent {
    constructor() {
        super({ id: 'backend', role: 'Ingénieur Backend', description: 'Runtime, stockage, API et primitives Rust.', keywords: ['api', 'backend', 'rust', 'runtime', 'store', 'storage', 'base de données', 'endpoint', 'serveur', 'cli', 'crates'] });
    }
    plan(task) {
        return [`Analyse : "${task}".`, "Isolation dans une Capsule dédiée.", 'Implémentation crates avec tests unitaires.', 'Fusion conditionnelle dans la branche principale.'];
    }
}

class FrontendAgent extends Agent {
    constructor() {
        super({ id: 'frontend', role: 'Ingénieur Frontend', description: 'Studio web, interfaces, visualisation.', keywords: ['ui', 'interface', 'studio', 'web', 'frontend', 'écran', 'graphique', 'affichage', 'dashboard', 'visualisation'] });
    }
    plan(task) {
        return [`Analyse : "${task}".`, 'Fork workspace pour expérimenter sans casser la vue stable.', 'Implémentation composants + état local versionné.', 'Replay causal pour vérifier la déterminisme.'];
    }
}

class QAAgent extends Agent {
    constructor() {
        super({ id: 'qa', role: 'Ingénieur QA', description: 'Tests, régressions, évaluation empirique.', keywords: ['test', 'qa', 'bug', 'régression', 'verifier', 'vérifier', 'qualité', 'benchmark', 'evaluation', 'évaluation'] });
    }
    plan(task) {
        return [`Analyse : "${task}".`, "Snapshot avant exécution (rollback garanti).", 'Exécution de la suite de tests + collecte des résultats.', "Rapport d'évidence lié à un test exécutable."];
    }
}

class Orchestrator {
    constructor(telemetry = new TelemetryAgent()) {
        this.telemetry = telemetry;
        this.agents = [new BackendAgent(), new FrontendAgent(), new QAAgent()];
        this.counter = 0;
        this.queue = [];
        this.history = [];
        this.activeSlots = [];
        this.lot = new ParkingLot();
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

    _parkOldest() {
        const oldest = this.activeSlots.shift();
        if (!oldest) return null;
        const entry = this.lot.park(oldest);
        this.telemetry.log(`Slot [${oldest.agentId}] garé (tâche #${oldest.task.id}).`);
        return entry;
    }

    _occupySlot(agent, task, steps) {
        const slot = { agentId: agent.id, keywords: agent.keywords, task, steps, startedAt: new Date().toISOString() };
        this.activeSlots.push(slot);
        return slot;
    }

    wakeAgent(agentId) {
        const entry = this.lot.wake(agentId);
        if (!entry) return `Aucun agent "${agentId}" dans le parking.`;
        this.activeSlots.push({ ...entry, resumedAt: new Date().toISOString() });
        this.telemetry.log(`Agent [${agentId}] réactivé depuis le parking (tâche #${entry.task.id}).`);
        return `[${agentId}] réactivé — tâche #${entry.task.id} : "${entry.task.text}"`;
    }

    async processNext() {
        const item = this.queue.shift();
        if (!item) return null;

        if (this.activeSlots.length >= MAX_SLOTS) {
            this._parkOldest();
        }

        const parkedMatch = this.lot.bestMatch(item.text);
        if (parkedMatch) {
            this.telemetry.log(`Match parking : réactivation de [${parkedMatch.agentId}] pour #${item.id}.`);
            this.lot.wake(parkedMatch.agentId);
        }

        const startedAt = Date.now();
        const ranked = this.selectAgent(item.text);
        let outcome;

        if (ranked[0].score === 0) {
            this.telemetry.log(`Délibération multi-agents pour #${item.id}.`);
            const steps = [];
            for (const { agent } of ranked) {
                this.telemetry.log(`[${agent.id}] formule son approche pour #${item.id}...`);
                steps.push(...agent.plan(item.text));
                await sleep(120);
            }
            this._occupySlot(ranked[0].agent, item, steps);
            outcome = { ...item, mode: 'délibération', assignedTo: this.agents.map((a) => a.id), steps, durationMs: Date.now() - startedAt };
        } else {
            const { agent, score } = ranked[0];
            this.telemetry.log(`#${item.id} assignée à ${agent.id} (score ${score}).`);
            const steps = agent.plan(item.text);
            for (let i = 0; i < steps.length; i++) {
                this.telemetry.log(`[${agent.id}] étape ${i + 1}/${steps.length}`);
                await sleep(150);
            }
            this._occupySlot(agent, item, steps);
            outcome = { ...item, mode: 'spécialiste', assignedTo: [agent.id], steps, durationMs: Date.now() - startedAt };
        }

        this.activeSlots = this.activeSlots.filter((s) => s.task.id !== item.id);
        this.lot.park({ agentId: outcome.assignedTo[0], keywords: ranked[0].agent.keywords, task: item, steps: outcome.steps, startedAt });
        this.telemetry.log(`[${outcome.assignedTo[0]}] garé après tâche #${item.id}.`);

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
            activeSlots: this.activeSlots,
            parked: this.lot.parked,
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
        this.activeSlots = payload.activeSlots ?? [];
        this.lot.parked = payload.parked ?? [];
        this.persist();
        this.telemetry.log(`Snapshot "${name}" restauré (${this.history.length} tâches, ${this.queue.length} en attente).`);
        return null;
    }

    status() {
        return [
            `[Orchestrator] État courant`,
            `  Slots actifs       : ${this.activeSlots.length}/${MAX_SLOTS}`,
            `  Parking lot        : ${this.lot.parked.length} agent(s)`,
            `  File d'attente     : ${this.queue.length}`,
            `  Historique         : ${this.history.length}`,
            `  Snapshots          : ${this.listSnapshots().join(', ') || 'aucun'}`,
        ].join('\n');
    }

    renderSlots() {
        if (this.activeSlots.length === 0) return '[Orchestrator] Aucun slot actif.';
        return this.activeSlots.map((s) => `  [${s.agentId}] tâche #${s.task.id} : "${s.task.text}" (depuis ${s.startedAt})`).join('\n');
    }

    renderParked() {
        if (this.lot.parked.length === 0) return '[Orchestrator] Parking lot vide.';
        return this.lot.parked.map((s) => `  [${s.agentId}] tâche #${s.task.id} : "${s.task.text}" (garé ${s.parkedAt})`).join('\n');
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
    `Agents : backend | frontend | qa (+ Observer) — ${MAX_SLOTS} slots max, rotation parking lot`,
    '',
    'Commandes :',
    '  help              Afficher cette aide',
    '  agents            Lister les agents et leurs spécialités',
    '  status            État de l\'orchestrateur',
    '  task <texte>      Soumettre une tâche au swarm (le texte libre fonctionne aussi)',
    '  slots             Slots actifs actuels',
    '  parked            Agents dans le parking lot',
    '  wake <agentId>    Réactiver un agent garé (backend | frontend | qa)',
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
        case 'slots':
            return `[Orchestrator] Slots actifs :\n${orchestrator.renderSlots()}`;
        case 'parked':
            return `[Orchestrator] Parking lot :\n${orchestrator.renderParked()}`;
        case 'wake':
            if (!argument) return '[Orchestrator] Usage : wake <agentId>';
            return orchestrator.wakeAgent(argument);
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
