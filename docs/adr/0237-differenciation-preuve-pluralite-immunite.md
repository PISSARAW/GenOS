# ADR 0237 — Différenciation GenOS : preuve, pluralité, immunité (pas la course aux canaux)

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : Stratégie produit, orchestration, épistémologie, sécurité
- **Décision-id** : 0237
- **Lié à** : ADR 0235 (Ontogenèse), roadmap P1–P9, ADR 0198 (vérification épistémique), ADR 0206 (decision-evidence binding), ADR 0234 (preuves POET)

## Contexte

L'Ontogenèse V1 (ADR 0235) et la roadmap P1–P9 ont largement consisté à
rattraper les comportements observables de ChatGPT Dots (responsabilité
durable, conversation permanente, réveils, routage, schedules) et de
Meta Muse (délégation main → subagents, clarification, confirmation
avant irréversible, event log, fan-out). Ce rattrapage était nécessaire
mais n'est pas une stratégie : joué sur leur terrain (cloud propriétaire,
canaux privateurs, modèle toujours plus capable), GenOS perd à coûts
marginaux et à lock-in près.

Dots et Muse partagent la même architecture de fond : un agent (ou un
essaim ad hoc) + un modèle + des outils + des permissions. Toute leur
sûreté est périphérique (reviews, approvals, sandbox, calibrage du
modèle). GenOS possède une assise différente et déjà partiellement
implémentée : un runtime épistémique où un transport réussi n'est pas
une décision valide, une pluralité de topologies exécutables avec
barrières de preuves, une immunité au niveau runtime (AEIS), des budgets
métaboliques qui mordent (apoptose, cryptobiose), et des contrats de
symbiose pour les intégrations externes (Holobionte). Aucun concurrent
ne combine ces quatre propriétés parce qu'elles sont architecturales,
pas des fonctionnalités qu'on ajoute après coup.

## Décision

GenOS ne joue plus la parité des canaux. L'Ontogenèse se différencie sur
quatre axes, dans cet ordre, en réutilisant les mécanismes existants par
leurs contrats :

### 1. Délibération adversariale opposable avant toute action coûteuse

Toute action classée `irreversible` ou `external` par la review
pré-dispatch (P2) passe par un rituel Trinity (chambres scellées,
comparaison indépendante) ou Biocénose (délibération, veto minoritaire)
avant exécution. Le dissentiment est persisté dans le dossier de preuves
(`ontogenesis_decisions`), jamais résumé en consensus mou. Références :
sélecteur P1–P9 existant, `workerKindService` (vérificateurs, red team),
preuves POET.

### 2. Certificats d'exécution falsifiables sur chaque intégration

Chaque commit de l'intégrateur unique porte son certificat : commande de
vérification rejouable, hash du protocole, graines, budgets consommés,
SHA du résultat intégré. Le positionnement s'inverse : là où Dots
apporte du travail « remarquablement capable », GenOS apporte du travail
**réfutable** — tout résultat est livré avec de quoi le contester.
Références : `integrationService` (tatouage `Genos-Operation`),
`ledgerService` (journal rejouable), `spendVsBudget`.

### 3. Immunité épistémique sur toutes les entrées exogènes

Tout message ou événement venu de l'extérieur (webhook, Slack/Teams,
trouvaille recon, plugin) est un antigène potentiel : scoring AEIS,
quarantaine avant dispatch, admission explicite. Les canaux ouverts de
P6 ne deviennent sûrs qu'à cette condition. Le modèle ne filtre jamais
ses propres entrées seul. Références : `reconService` (garde read-only),
`channelService`, quarantaine existante avant dispatch.

### 4. Métabolisme ressenti et symbiose contractuelle

Le contrôleur lui-même est soumis au métabolisme : coût par décision
affiché dans `status`, branches stériles fossilisées (pas seulement
`blocked`), apoptose avec reçu. Les intégrations externes passent en
contrats d'hôte Holobionte : admission sandbox, veto de l'hôte, ledger
de contributions vérifiées, révocation sans contamination — l'inverse
du « connecte tes 4000 apps avec tes identifiants ». Références :
`memoryPressure`, `fleetService`, `pairingService`.

### Non-objectifs explicites (on ne les fera pas)

Cloud propriétaire fermé, canaux privateurs, avatars et habillage,
browser personnel avec sessions persistantes, course au modèle le plus
capable. Ces terrains appartiennent aux coûts marginaux et au lock-in
des concurrents. L'exécution distante reste possible (P8) mais comme
hébergement du même runtime ouvert et vérifiable, jamais comme
plateforme fermée.

## Conséquences

### Positives

- Position défendable et démontrable : chaque différenciant se prouve
  par exécution (dissentiment persisté, certificat rejoué, antigène
  quarantiné, reçu d'apoptose), pas par marketing.
- Capitalise le stock existant au lieu de le diluer : topologies,
  gates, AEIS, métabolisme et Holobionte deviennent le produit, pas
  l'infrastructure invisible.
- La V1 reste compatible : rituel adversarial branché sur `ask_first`,
  certificats sur `integrationService` + `ledgerService`, AEIS sur
  l'inbox, métabolisme sur `status`. Aucune rupture de contrat.

### Négatives

- Vitesse perçue : délibération + certificats coûtent du temps et des
  tokens face à un concurrent qui répond vite et avec aplomb.
- Complexité d'explication : « réfutable » se vend moins vite que
  « remarquablement capable » ; la preuve exige un effort du lecteur.
- Charge d'implémentation : quatre chantiers réels (rituel, certificats,
  AEIS-inbox, métabolisme du contrôleur), chacun avec ses gates.

## Alternatives

- **Parité des canaux et du cloud** : rejetée — terrain adverse, coûts
  marginaux, lock-in, et aucune preuve que la parité y soit atteignable
  par une équipe locale-first.
- **Calibrage modèle seul (voie Muse 1.3)** : rejetée comme stratégie
  unique — utile en complément (classification d'irréversibilité),
  insuffisante seule car le modèle reste juge de ses propres entrées.
- **Ordonnanceur distribué transparent** : rejeté — hors des garanties
  du runtime (pas de suspension fiable), contredirait l'ADR 0235 §10.
- **Statu quo V1** : rejeté — la parité P1–P9 sans différenciation fait
  de l'Ontogenèse un Dots local moins bien financé.

## Tests

- Rituel adversarial : toute action `irreversible`/`external` sans
  dossier de dissentiment est refusée (test dédié, table
  `ontogenesis_decisions` non vide exigée).
- Certificats : chaque commit d'intégration est rejoué depuis son seul
  certificat sur base saine (reproduction mécanique).
- AEIS-inbox : corpus d'injections (prompt, webhook, pièce jointe)
  quarantinées avant tout effet backlog.
- Métabolisme : coût par décision visible dans `status`, apoptose avec
  reçu fossilisé, aucune croissance incontrôlée en exécution prolongée.
- Portes du dépôt : `python scripts/ci/check_code_quality.py`,
  `npm test`, `cargo test --workspace`.

## Références

- ADR 0235 (Ontogenèse), roadmap P1–P9 (`backend/src/services/ontogenesis/`).
- Docs Dots (comportements uniquement) : `https://learn.chatgpt.com/docs/dots`,
  `https://learn.chatgpt.com/docs/dots/controls`.
- Annonces Meta Muse Spark 1.1–1.3 et Muse Code (délégation, compaction,
  event log rejouable, fan-out worktrees).
- `docs/01-concepts/ontogenese.md` §9, `docs/04-exploitation/ontogenese.md`.
