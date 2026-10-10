# Essai GenOS Studio sur cinq niveaux de missions

- Statut : parcours opérateur partiellement qualifiés.
- Date de l'essai et dernière revue : 2026-10-10.
- Version testée : `6b1e1a6343e0e0311da681732a2dae40978ae3a4`, branche
  `codex/studio-product-parity`, et non le checkout principal V3.

Studio a réalisé des opérations persistantes sur des fichiers, workflows,
checkpoints et releases locales. Cet essai manuel ne constitue pas une
qualification de cinq missions LLM autonomes : les workflows exécutés sont
structurels, les clones partagent les fichiers et la revue de production
a été refusée à l'identité opérateur.

## Protocole et isolation

Les cinq parcours ont été pilotés dans le navigateur sur un serveur HTTP local,
avec les API réelles et un worker effectif. Les réponses n'ont pas été remplacées
par des réponses simulées. La base SQLite, le projet `b06-project` et le workspace
`consumer-ws` ont été préparés dans un répertoire temporaire avec les fixtures
[B06](../../backend/tests/helpers/b06ClientFixture.cjs).

Le dossier initial `awaiting_approval` était une fixture préparée : son inspection
ne prouve pas l'exécution des étapes planifiées. L'identité avait une clé
`operator` et une appartenance `member` au projet. Aucun droit n'a été élargi,
aucun fournisseur LLM externe appelé et aucun projet réel modifié.

## Résultats par niveau

| Niveau | Mission opérateur | Résultat vérifié | Limite |
| --- | --- | --- | --- |
| 1 | Inspecter un dossier et ses preuves | État `awaiting_approval`, étapes planifiées, mesures inconnues et absence de promotion visibles. | Dossier préparé, pas mission autonome accomplie. |
| 2 | Modifier et récupérer un fichier | `a/verify.cjs` sauvegardé avec une nouvelle empreinte ; calcul indépendant donnant 10 ; restauration exacte du contenu initial. | Calcul exécuté séparément par Node, pas depuis un nœud métier Studio. |
| 3 | Construire et exécuter un workflow | Trois nœuds et deux liens sauvegardés ; validation serveur ; version 2 en staging ; run `completed` et trois spans persistés. | La sortie décrit les états des nœuds, pas le calcul demandé dans les entrées. |
| 4 | Créer et comparer une alternative GenOS | Checkpoint agent et workspace, référence de branche et clone inactif créés ; différences d'états retournées. | `shared_workspace` : les fichiers ne sont pas isolés. |
| 5 | Publier et retirer une release locale | Version figée, staging publié, appel terminé avec trois spans, retrait du slot et feedback persisté. | Revue refusée avec `403 PRODUCTION_REVIEW_FORBIDDEN` ; aucune publication en production. |

Le retour arrière du niveau 2 a prévisualisé un seul fichier concerné, puis créé
un snapshot de sécurité avant restauration. La relecture depuis Studio et le
contrôle sur disque retrouvent le contenu initial et son empreinte SHA-256
`47d8de9c57c2f559a686c1706825d03a4792b212a3d400987fda49793f8e632f`.

Au niveau 3, les entrées contenaient les valeurs `[2, 3, 5]` et le résultat attendu
`10`. Le worker n'a pas calculé cette somme : sa sortie contient `nodes: 3` et
les statuts des nœuds. Un statut `completed` n'est donc pas une preuve de résultat
métier ni de qualité d'un modèle.

Au niveau 5, le retrait de la première release laisse le staging sans release
active, à la révision 2. Il ne revient pas sur les appels déjà exécutés ni sur
d'éventuels effets externes. Le refus de revue est attendu pour cette identité ;
la publication en production n'a pas été qualifiée par cet essai.

## Vérifications et traçabilité

Une vérification SQLite en lecture seule confirme deux runs terminés, trois spans
par run, un manifeste de release dont l'empreinte correspond au payload, aucun
reçu de revue, un feedback et les permissions du projet inchangées.

| Observation | Identifiant persistant |
| --- | --- |
| Workflow | `wf-9a19ee67-9363-4fb6-b667-5ef6394ab3c8` |
| Run constructeur | `wfr-dfd8ef02-2c85-4dfc-b64d-e8d28d7a8ff9` |
| Run staging | `wfr-studio-fb403e55-8f44-4d79-88c2-e28baeb1c75d` |
| Checkpoint agent | `agent-state-1791644547822-rpqblr` |
| Branche alternative | `agent-branch-1791644579957-hclsld` |
| Clone inactif | `agent_clone_1791644604974_i1c6` |
| Release figée | `rel-610fdeda-7bbc-465b-a66f-a0773b03979d` |

Le bilan local `.genos-tests/studio-five-levels/bilan.json`, vérifié à
15:08:00 UTC, porte l'empreinte SHA-256
`1a592053f537eb33223dceaccf8e3fbd3ef1ce9ac6356f1071f843855fa623ec`.
Il contient les empreintes des sources Studio testées. Dix captures du parcours,
la base temporaire et le journal HTTP restent des artefacts locaux ignorés,
non livrés dans Git. Le serveur d'essai a été arrêté après déconnexion.

L'expérience `84d7facd-797e-48a3-a6f9-d6da8532ae27` est conservée dans GenOS.
Cet enregistrement ne constitue pas un reçu de promotion.

## Rejouer les contrats correspondants

Les suites versionnées suivantes couvrent les contrats utilisés par ces parcours.
Leur rejeu n'est pas le rejeu exact des actions manuelles ni la reproduction des
identifiants ci-dessus. Fournir dans `GENOS_BIN` le CLI compilé du checkout testé,
ainsi que Playwright et Edge selon la configuration du dépôt.

```sh
npm --prefix backend run test:studio
npm --prefix backend run test:studio:builder
npm --prefix backend run test:studio:genos
npm --prefix backend run test:studio:production
```

Procédures complémentaires : [parcours GenOS](../04-exploitation/studio-parcours-genos.md),
[boucle de production](../04-exploitation/studio-boucle-production.md) et
[qualification visuelle](studio-surfaces-dominantes.md).

## Limites et suites nécessaires

La comparaison d'états affiche plusieurs lignes génériques « Objet observé » avec
un état inconnu ; les champs comparés ne deviennent lisibles qu'en sélectionnant
une ligne. Les longs dossiers demandent encore un défilement local.

Pour qualifier des missions autonomes, il reste à exécuter un résultat métier
observable avec un fournisseur et un budget explicites, comparer des alternatives
aux fichiers réellement isolés, puis faire examiner la release par une identité
autorisée. Cet essai ne mesure ni charge, disponibilité, déploiement cloud ni
réversibilité d'effets externes.
