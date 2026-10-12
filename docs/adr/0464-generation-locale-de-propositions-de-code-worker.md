# ADR 0464 — Génération locale bornée des propositions de code worker

## Statut

Accepté. Qualification C2/C3 vérifiée sur Windows le 2026-10-12 avec Ollama
`qwen2.5-coder:32b`; les rapports sont exploratoires, le checkout étant modifié.

## Date

2026-10-12

## Domaine

Workers locaux, génération de code, budgets, autorité, preuve

## Décideurs

Équipe GenOS

## Lié à

- [ADR 0043 — Runtime worker commun et phénotypes composables](0043-runtime-worker-phenotypes.md)
- [ADR 0457 — Ingestion et clôture des missions worker vérifiées](0457-ingestion-routeur-cloture-worker-verifiee.md)

## Contexte

Le chemin de génération locale d'un worker appelait le routeur avec le domaine
cognitif `worker`. Le routeur construisait alors un graphe natif contenant
`worker/execute`, sans handler enregistré pour cette opération. La génération
était bloquée avant l'appel du fournisseur.

Le harnais de qualification créait des workers locaux sans transmettre leur
scope de budget parent à `startMission`. Il ne transmettait pas non plus le bail
d'écriture jusqu'au contrat persisté : le worker avait `authority.write=false`
même lorsque la mission demandait un bail explicite.

## Décision

Pour la génération d'une proposition locale, transmettre `cognitiveIntegration:
worker` afin de conserver la comptabilité économique, sans construire le graphe
natif `worker/execute`. La mission reste soumise au routage et au budget local
normaux.

Transmettre `modelBudgetScope` du contrat worker à `startMission`. Construire
l'autorité d'écriture du contrat depuis `writeLease=true`, ou depuis la
combinaison `allowFileEdits=true` et `workspaceProvisioned=true`. Le service de
code local continue à valider les chemins, les commandes allowlistées, les
empreintes de fichiers et les résultats des tests; il restaure les fichiers si
les tests échouent.

Pour le worker borné, construire le rapport de preuve depuis les fichiers
modifiés et les tests réellement exécutés, le persister comme observation
`EVIDENCE_REPORT`, puis demander le quorum natif avant d'émettre
`AGENT_COMPLETED`. Attacher la référence du quorum à l'événement terminal. Le
sujet d'oracle lie le contrat assigné, l'empreinte du fichier et le rapport
observé. Un verdict absent reste omis dans la forme canonique au lieu d'être
représenté par `undefined`.

## Conséquences

### Positives

- Le modèle local peut recevoir la demande de proposition sans buter sur un
  handler de graphe absent.
- Le budget parent et le bail d'écriture explicite arrivent dans le runtime et
  le contrat worker persisté.
- Les tests de code passent avant clôture; deux stratégies natives distinctes
  vérifient chacune les 264 cas du contrat `euclidean_modulo_v1`.
- Le gate relit l'assemblée AEIS et la décision persistée, valide deux reçus
  indépendants et refuse le run si le quorum est absent ou altéré.
- La mission `q-4c5fe7390089` a terminé avec `independent_quorum`; son code est
  `((a % b) + b) % b` et son `npm test` a terminé avec le code 0.
- Le cas comparatif `bounded-code` est maintenant mesuré par un adaptateur qui
  lance cette mission et valide le reçu biologique, le quorum natif et les
  postconditions; la campagne Windows du 2026-10-12 a passé 24/24 cas.

### Négatives

- La qualification a été faite sur checkout modifié; elle reste exploratoire
  jusqu'à répétition sur un commit propre.

## Alternatives

- Enregistrer un handler natif `worker/execute` pour le graphe de domaine. Cette
  option confondrait l'inférence de proposition avec l'exécution de la mission;
  elle demande un contrat de handler et un gate séparés.
- Accorder l'écriture sans bail. Rejeté : l'autorité reste liée à un bail explicite
  et à une capsule provisionnée.
