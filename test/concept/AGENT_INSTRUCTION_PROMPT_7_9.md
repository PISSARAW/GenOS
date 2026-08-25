# Protocole d'Évaluation Empirique GenOS (Concepts 7 à 9)

**⚠️ INSTRUCTIONS POUR L'AGENT IA QUI LIT CE FICHIER ⚠️**
Ton objectif est de conclure la validation empirique de l'architecture GenOS sur les Concepts 7 à 9 (Évolution & Sélection, Génétique Quantitative, Génétique des Populations).
Tu dois exécuter des tests **100% réels**, compiler ou exécuter le CLI `genos`, créer de vrais fichiers de code, et rédiger ton rapport dans `GenOS_Real_Results_7_9.md`.

---

## PHASE 1 : Mise en place (L'Écosystème)
1. Dans un répertoire `test_env_genos_7_9`, crée un composant React/TypeScript complexe (ex: un composant Table de données virtuel avec tri et filtres).
2. Crée un script d'évaluation (ex: un test unitaire qui mesure à la fois le temps d'exécution, la justesse du rendu, et la taille du bundle ou le coût cognitif).

---

## PHASE 2 : Concept 7 — Évolution & Front de Pareto
**Tâche :** Optimiser le composant Table.
1. **Agent Expert (Classique) :** Demande à l'agent d'optimiser le composant. Il va utiliser un maximum de tokens, potentiellement réussir le test, mais avec un code lourd ou illisible. L'approche classique dira "Test Vert = Succès", ignorant le coût.
2. **Orchestrateur GenOS (Sélection Multi-Objectifs) :**
   - Crée 3 Workers GenOS avec des génomes différents (un axé rapidité `speed=0.9`, un axé sécurité `strictness=0.9`, un équilibré).
   - Fais-les concourir sur la tâche. Mesure *réellement* (ou récupère via les métriques GenOS) les tokens consommés ET la réussite des tests.
   - Démontre la mécanique du **Front de Pareto** : L'agent sélectionné ne doit pas être juste "le plus rapide" ou "celui qui passe les tests", mais le point optimal d'efficience économique (Fitness multivariée). Si le CLI gère `eval`, utilise-le, sinon utilise l'API ou documente la sélection écologique (saturation de niche).

---

## PHASE 3 : Concept 8 — Génétique Quantitative & Héritabilité (h²)
**Tâche :** Vérifier si un succès est dû au génome ou à la chance (l'environnement).
1. **Agent Expert (Classique) :** Face à un bug réseau aléatoire intermittent (flaky test), l'agent propose un correctif, le test passe par chance, l'agent déclare "C'est réparé !".
2. **GenOS (GBLUP & QTL) :**
   - Exécute `cargo run -p genos-cli -- agent infer-traits ...` (ou équivalent) sur un Worker qui a réussi.
   - Clone le Worker victorieux (ex: via `agent fork` ou création multiple). Relance-le 5 fois.
   - Mesure la **Variance (Vp)** : Si le clone échoue 4 fois sur 5 (Héritabilité $h^2$ faible), GenOS rejette l'agent car le succès était dû à l'environnement (Ve), pas à son génome (Va).
   - Documente comment cette mécanique ("Glass Box") surpasse la naïveté du Prompt Engineering classique face aux faux positifs.

---

## PHASE 4 : Concept 9 — Génétique des Populations & Chaos
**Tâche :** Tester la résilience au désastre et la migration.
1. **Goulet d'Étranglement (Bottleneck) :** 
   - Simule un Swarm de 10 capsules/agents (`cargo run -p genos-cli -- capsule fork ...`).
   - Provoque un désastre (tue aléatoirement 8 capsules sur 10).
   - Demande au système de repeupler à partir des 2 survivants et mesure la **dérive génétique** (les génomes de la nouvelle population sont-ils moins diversifiés ?).
2. **Migration (Flux de gènes) :**
   - Crée deux "Dèmes" isolés : un groupe d'agents `UI` et un groupe d'agents `DB`.
   - Effectue un *Migration Step* (transfère un agent DB dans le dossier/groupe UI). 
   - Prouve par le code généré que la pollinisation croisée a lieu : l'agent hybride résout un problème UI qui nécessitait en réalité une optimisation de requête (évitant ainsi un N+1 query invisible pour les UI purs).

---

## PHASE 5 : Rapport Empirique Final
Dans `GenOS_Real_Results_7_9.md`, rassemble toutes les exécutions réelles, les JSON/YAML des génomes mutés ou inférés (`agent infer-traits`, `capsule fork`), et démontre sans aucune simulation que :
1. Le Pareto sélectionne la rentabilité, pas juste le succès binaire.
2. L'héritabilité mathématique filtre les faux positifs (chance).
3. Le chaos engineering et la migration de Dèmes empêchent l'effondrement ou la consanguinité intellectuelle des essaims.

**DÉMARRE L'EXÉCUTION RÉELLE MAINTENANT.**
