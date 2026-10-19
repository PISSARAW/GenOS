# ADR 0647 — Boucle ETT multicycle et questionnement endogène

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : pensée endogène, cycles cognitifs, génération d'hypothèses, SQLite
- **Lié à** : ADR 0626, ADR 0627, ADR 0646

## Contexte

L'automate ETT autorisait `LEARNED → FOLLOW_UP → QUESTIONED`, mais les tables de
tâches, runs, vérifications, apprentissages et réservations imposaient encore une
unicité par épisode. Une seconde question pouvait donc être persistée, mais pas
un second raisonnement complet. La continuation d'état ne formait pas une boucle
cognitive exécutable.

La détection acceptait un générateur de question synchrone injecté. Sans ce
callback, le texte, l'hypothèse et les scores d'évaluation provenaient de règles
fixes. Le générateur transversal d'hypothèses n'était pas raccordé au chemin ETT.

## Décision

Les artefacts cycliques sont désormais uniques par leur parent immédiat : décision
d'admission pour la tâche, binding pour le run, run pour la vérification et
vérification pour l'apprentissage. Une migration reconstruira les anciennes
tables qui portent encore l'unicité `(organization_id, project_id, episode_id)`.
L'épisode, ses reçus et ses questions restent append-only.

Le service de suivi matérialise une nouvelle question scellée à partir de la
dernière question et du dernier apprentissage, puis avance
`FOLLOW_UP → QUESTIONED` en remettant à zéro les références de décision, tâche et
job. La provenance conserve le reçu d'apprentissage, la question précédente et
la tête de l'épisode.

`endogenousThoughtLoopService` reprend ensuite l'épisode à son état courant et
enchaîne automatiquement continuation, question, admission, mise en file,
raisonnement, vérification indépendante et apprentissage. La boucle exige un
signataire d'autorisations SHEV et un fournisseur de vérification indépendante ;
elle ne fabrique ni signature ni verdict. `maxCycles` est obligatoire et borné à
dix. À la limite, l'épisode termine en `STOPPED` avec `cycle-limit`.

La génération de question appelle automatiquement le générateur cognitif
transversal quand un budget monétaire existe. L'hypothèse et son plan sont ensuite
exécutés par le runner ETT sous sa frontière read-only habituelle. Une route de
modèle absente ou invalide produit un repli déterministe ; elle ne devient jamais
une preuve scientifique.

Les estimations de nouveauté, gain d'information et progression utilisent
désormais l'historique réel des observations de la dimension : proximité lexicale,
diversité entropique et répétition récente. Ces mesures restent des estimateurs
provisoires et ne sont pas promues comme calibration qualifiée.

## Conséquences

### Positives

- Un épisode peut parcourir plusieurs cycles complets sans collision SQLite.
- Le suivi produit effectivement une nouvelle question et un nouveau run.
- La génération LLM n'exige plus un flag de mission propre à Trinity pour ETT.
- Les portes SHEV, le sandbox des workers externes et l'attestation indépendante
  restent inchangés.

### Négatives

- Une boucle réelle dépend toujours d'une autorité capable de signer et d'un
  vérificateur indépendant disponible.
- Le mode cognitif peut se replier sur une proposition déterministe ; le reçu de
  vérification, pas le transport LLM, reste la source de validité.
- Les scores empiriques v2 ne constituent pas encore une calibration sur corpus
  réservé.

## Alternatives

- Créer un nouvel épisode à chaque suivi : rejeté, car cela casse la lignée et
  rend artificielle la transition `FOLLOW_UP → QUESTIONED` déjà scellée.
- Supprimer les portes d'autorité pour rendre la boucle « autonome » : rejeté,
  car une autonomie intellectuelle ne donne pas une autorité opérationnelle.
- Rendre un LLM obligatoire : rejeté, car l'indisponibilité d'un modèle ne doit
  ni casser la reprise ni être maquillée en succès vérifié.

## Vérification

- `node backend/tests/test_endogenous_thought_campaign.js`
- `node backend/tests/test_endogenous_thought_cycles.js`
- `node backend/tests/test_endogenous_thought_detection.js`
- `node backend/tests/test_endogenous_thought_runner.js`
- `node backend/tests/test_endogenous_thought_verification.js`
- `python scripts/ci/check_code_quality.py`
