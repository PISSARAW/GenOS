# Simulations Avancées et Validations

## Coévolution et Simulations Scientifiques

### Security Co-evolution (Armement Red vs Blue)
Une simulation abstraite où des populations d'agents offensifs et défensifs subissent des mutations et s'affrontent sur plusieurs générations. Un observateur neutre quantifie les compromissions et faux positifs, tout en traçant séparément les lignées génétiques et les mondes simulés.

### Scientific Compression Research
Un protocole de recherche versionné sans LLM où l'historique des snapshots est séparé de la "timeline" des conclusions. GenOS orchestre des critiques croisées et des audits contradictoires, permettant de restaurer des conclusions pour investigation sans détruire les hypothèses concurrentes.

## Benchmarks et Validation Stricte

### Orchestrateur de Flotte
GenOS possède un orchestrateur interne qui gère un portefeuille de tâches et classe les agents par adéquation, ajustant dynamiquement leurs *drives* pour répondre aux profils requis.

### Garde-Fous de Benchmarking (Validation Anti-Triche)
Les résultats restent marqués comme en attente (`executed_pending_audit`) jusqu'à approbation humaine et certification cryptographique (SHA-256) du dataset de test. Le moteur refuse de moyenner des benchmarks incompatibles.

## L'API Primitive "Trace" Sous-Jacente
Toutes ces capacités reposent sur une API canonique bas niveau :
`agent init` → `agent snapshot` → `agent fork` → `agent mutate` → `agent breed` → `agent run` → `agent replay` → `agent diff` → `agent merge` → `agent lineage` → `agent restore`.
Ces commandes exposent les primitives absolues de l'évolution et de l'isolation au sein de GenOS.
