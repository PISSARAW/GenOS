# Studio — cycle produit durable

- **Statut** : Implémenté pour le backend local Studio
- **Portée** : contrats, évaluations, acceptation, effets et initiatives SQLite
- **Dernière revue** : 2026-10-19
- **Décision** : [ADR 0682](../adr/0682-cycle-produit-durable-studio.md)

## Contrats et frontières

Le cycle complète la [boucle de production locale](../04-exploitation/studio-boucle-production.md).
Il ne génère pas une interface et ne déploie aucun service externe. Il conserve
les distinctions suivantes :

| État | Ce qu'il établit | Ce qu'il n'établit pas |
| --- | --- | --- |
| Contrat versionné | but, hypothèses, critères et rollback attendus | qualité d'une release |
| Évaluation d'aperçu | critères observés par un évaluateur | acceptation, usage ou effet réel |
| `READY_FOR_ACCEPTANCE` | jury pluraliste complet et soutenu | autorisation de publication |
| Acceptation | décision owner/admin liée au hash du jury | effet utilisateur |
| Observation d'effet | mesure sur un run production terminé | causalité générale ou transfert |
| Initiative | prochaine expérience ou rollback recommandé | exécution de cette action |

Les contrats exigent au moins une hypothèse utilisateur, un critère visuel et un
critère fonctionnel. `expectedRevision` protège leur lignée contre les écritures
concurrentes. Le hash canonique détecte une réécriture du payload persistant.

## API locale

Toutes les routes restent sous `/api/studio/production`, avec scope tenant et
permissions existantes :

| Méthode et chemin relatif | Effet |
| --- | --- |
| `POST /workflows/:workflowId/product-contracts` | crée la révision suivante sous CAS |
| `GET /workflows/:workflowId/product-contracts/current` | lit et vérifie la tête |
| `POST /releases/:releaseId/product-contracts/:contractId/evaluations` | ajoute une preuve d'aperçu indépendante |
| `GET /releases/:releaseId/product-contracts/:contractId/decision` | calcule `NO_CHANGE`, rejet ou préparation à l'acceptation |
| `POST /releases/:releaseId/product-contracts/:contractId/acceptance` | accepte ou rejette explicitement le hash courant |
| `POST /releases/:releaseId/product-contracts/:contractId/effects` | mesure un run production terminé et lié |
| `POST /releases/:releaseId/product-contracts/:contractId/post-delivery-review` | persiste une initiative consultative idempotente |

Quand une release possède des évaluations produit, la publication en production
revalide une acceptation positive sur le hash actuel. Les releases historiques
sans ce nouveau cycle conservent leur gate de revue de production antérieure.

## Jury pluraliste et `NO_CHANGE`

Un évaluateur ne peut pas être le créateur de la release. Deux identités
distinctes doivent couvrir les modalités `visual` et `functional`, ainsi que
tous les critères du contrat. `security` et `accessibility` peuvent compléter
le jury. Une preuve manquante, inconclusive ou incomplète donne `NO_CHANGE` ;
une réfutation donne `REJECT` et `rollbackRecommended: true` ; un ensemble
complet soutenu donne `READY_FOR_ACCEPTANCE`.

L'acceptation exige une membership `owner` ou `admin`. Elle conserve le hash
du jury. Une évaluation ajoutée ou modifiée change ce hash et bloque la gate
suivante. Cette intégrité logique ne remplace pas la protection du fichier SQLite
contre un administrateur de l'hôte.

## Effet réel, initiative et apprentissage

Une observation d'effet doit référencer un `workflow_run` terminé, sans erreur,
admis en environnement `production` pour la même release et le même hash. Le
créateur de la release ne peut pas être l'observateur. Le service calcule le
verdict depuis `baseline`, `observed`, `direction` et `minimumEffect`. Le nombre
d'échantillons et les références de preuve sont obligatoires, mais GenOS ne
prétend pas en déduire une significativité statistique.

La revue post-livraison choisit :

- `NO_CHANGE` si les preuves sont insuffisantes ou inconclusives ;
- `ROLLBACK_RECOMMENDED` si une régression est observée ;
- `PROPOSE_TRANSFER_EXPERIMENT` si deux observateurs et deux runs distincts,
  dont un contexte holdout, soutiennent l'hypothèse.

Dans le dernier cas, `sourceVerified: true` signifie seulement que la source
satisfait ce protocole. `requiresTargetExperiment: true` interdit de transférer
la conclusion comme vérité dans un autre contexte. L'initiative n'exécute ni
publication, ni rollback, ni mutation du workflow.

## Biomimétismes opérationnels

- **Mémoire développementale** : le contrat parent-enfant conserve l'intention
  produit au-delà d'une génération rapide.
- **Perception multimodale** : le jury combine au minimum forme visuelle et
  fonction accomplie, sans réduire la qualité à un score unique.
- **Homéostasie** : une régression déclenche un signal de restauration, pas une
  réparation aveugle.
- **Immunité et tolérance** : les gates refusent les preuves auto-produites,
  périmées ou altérées, tout en faisant de `NO_CHANGE` une issue normale.
- **Plasticité bornée** : une expérience source vérifiée propose un transfert,
  mais le nouvel environnement doit encore le tester.

Ces analogies décrivent les contrats implémentés ; elles ne prouvent aucune
propriété biologique, cognitive ou causale générale.

## Machine d'état du produit

```text
CONTRACT_VERSIONED
  -> PREVIEW_EVIDENCE_PENDING
  -> NO_CHANGE | REJECT | READY_FOR_ACCEPTANCE
  -> ACCEPTED | REJECTED_BY_OWNER
  -> PRODUCTION_RUN_LINKED
  -> EFFECT_SUPPORTED | EFFECT_REFUTED | EFFECT_INCONCLUSIVE
  -> NO_CHANGE | ROLLBACK_RECOMMENDED | PROPOSE_TRANSFER_EXPERIMENT
```

Les flèches décrivent le protocole logique, pas une unique colonne de statut. Chaque
étape conserve son propre artefact afin qu'une nouvelle évaluation ne réécrive pas
l'acceptation précédente.

## Échecs exploitables

| Échec | Signification | Action |
| --- | --- | --- |
| révision attendue divergente | écriture concurrente du contrat | relire la tête et reconstruire |
| hash de jury différent | évaluations modifiées depuis acceptation | nouvelle acceptation |
| modalité manquante | jury incomplet | `NO_CHANGE` |
| évaluateur = créateur | auto-évaluation | refuser la preuve |
| run non terminé ou mauvaise release | effet non attribuable | refuser l'observation |
| effet réfuté | régression mesurée | recommander le rollback |
| contexte cible absent | transfert non testé | expérience cible requise |

## Observabilité

Suivre par workflow et release : révision du contrat, critères couverts, identités et
modalités du jury, hash accepté, run de production, métrique baseline/observée,
direction, échantillons, verdict d'effet et initiative suivante. Un compteur de
releases sans ces liaisons ne permet pas d'auditer le cycle.

## Vérification et limites

Les tests ciblés sont :

```powershell
node backend/tests/test_studio_product_contract.cjs
node backend/tests/test_studio_product_evaluation.cjs
node backend/tests/test_studio_product_effect.cjs
python scripts/ci/check_code_quality.py
```

La tranche ne fournit ni générateur UI, ni évaluation par navigateur, ni test
utilisateur externe, ni analyse statistique, ni déploiement cloud, ni rollback
des effets tiers. Les modalités `visual` et `functional` sont des contrats de
preuve ; leur oracle concret doit rester identifiable dans `evidenceRefs`.

Voir aussi [Contrats de stewardship V3](contrats-stewardship-v3.md),
[Runbook longitudinal](../04-exploitation/runbook-stewardship-longitudinal.md) et
[Matrice de qualification](../06-qualite-preuves/matrice-qualification-stewardship-v3-2026-10-20.md).

