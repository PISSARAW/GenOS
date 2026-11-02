# Intégrer GQEL dans une mission GenOS

- **Statut :** raccords natifs Node.js locaux implémentés ; activation explicite.
- **Portée :** contrats, exécution des workers, reçus durables, coordination A-Team et livrable final.
- **Dernière revue :** 2026-11-02.

GQEL produit et révise un artefact sous l'autorité de l'orchestrateur. Son
acceptation ne remplace jamais la validation des preuves ni la promotion de
mission. Les expériences V1 par script direct ne prouvent pas l'exécution de
ces raccords ; voir la [référence V1 archivée](../03-reference/gqel-v1-2026-11-02.md).

## Déclarer l'obligation avant le lancement

`qualityElevation` accepte des options compilées pendant la préparation ou un
contrat `genos.gqel-contract/v2` déjà compilé. `qualityRuntime` fournit les routes
explicites du générateur et des lecteurs. Ces données sont propagées dans les
missions natives et liées à l'enveloppe d'autorité. Un contrat persisté n'est
pas recompilé ; sa substitution ou sa suppression est refusée.

```javascript
const { compileQualityContract } = require('./backend/src/services/qualityElevation/qualityContract');
const qualityElevation = compileQualityContract({
  mission: 'Écrire le texte final selon le brief et les contributions vérifiées.',
  domain: 'creative_writing', policy: 'balanced', maxIterations: 3
});
const qualityRuntime = {
  generatorModel: 'ollama://llama3.1:8b',
  reviewers: [
    { id: 'reader-1', model: 'ollama://llama3.1:8b', focus: 'Causalité et actions' },
    { id: 'reader-2', model: 'ollama://llama3.1:8b', focus: 'Continuité et brief' }
  ]
};
// Champs de la mission ou de l'affectation explicite du worker concerné.
const qualityFields = { qualityElevation, qualityRuntime };
```

Deux lecteurs sur le même modèle restent dépendants. Le contrat peut exiger
plusieurs groupes de dépendance ; il faut alors fournir des routes satisfaisant
cette exigence. L'exemple ne démontre aucune indépendance des deux lecteurs.
Une configuration de routes ou de réparation sans contrat est refusée.

## Exécuter dans le runtime local

Le worker local produit son artefact selon son schéma habituel. GQEL examine
cet artefact exact puis demande des corrections bornées si nécessaire. Chaque
révision repasse par la génération native et la validation du candidat. Les
lectures utilisent `modelRouter`, l'identité du run, le budget partagé et
l'autorité existants. Les contrôles de protocole ne rendent pas une réponse
sémantiquement incorrecte acceptable.

Pour le code, l'examen porte sur les sources réellement présentes et liées aux
tests exécutés. Le premier candidat fixe l'ensemble des fichiers examinés ; une
révision portant sur un autre ensemble est refusée explicitement. Restaurer une
version applique les patches protégés et réexécute les tests concernés.

Appels, tokens mesurés, coût, délai, sortie tronquée, annulation et changement de
route sont contrôlés. L'échec remonte sous forme de `qualityFeedback`, avec les
défauts et la cause d'arrêt ; il ne devient pas une réussite de transport.

## Conserver et vérifier les preuves

Les sessions et checkpoints sont persistés en SQLite. Un reçu signé lie
l'agent, la mission, le run, l'autorité, le contrat et l'artefact livré exact.
Le contenu typé et, pour le code, le lien entre sources examinées et dossier
livré sont vérifiés. Une copie d'évaluation arbitraire ne peut pas créer un reçu.

La validation worker et les handoffs A-Team exigent ce reçu lorsqu'un contrat
GQEL est configuré. Un nouveau processus peut vérifier une preuve persistée ;
un ancien reçu ne peut pas être réutilisé pour un autre worker, run, contrat ou
contenu. Le chargement n'autorise pas une reprise automatique des générations.
Les gates d'autorité et de promotion restent applicables séparément.

## Coordonner les réparations A-Team

Une obligation `pending_repair` portant sur des critères de qualité peut
replanifier une tentative native bornée. Le plan doit posséder le contrat
GQEL, la lease et le budget nécessaires. L'original du contrat est conservé ;
`qualityRepair` transporte les diagnostics de la tentative sous son autorité.

Le coordinateur conserve les tentatives, constate résolution, stagnation ou
épuisement et bloque les consommateurs jusqu'à une preuve fraîche. Les handoffs
sont recalculés. Une panne d'autorité ou d'infrastructure suit son parcours de
refus ; elle n'est pas assimilée à un simple défaut éditorial.
Une réparation externe automatique exige une portée budgétaire partagée canonique.
Un TeamRun manuel ou détaché sans cette portée reçoit
`GQEL_REPAIR_SHARED_BUDGET_REQUIRED` ; il ne reçoit pas un nouveau budget à chaque tentative.

## Qualifier le livrable collectif

Le contrat du premier niveau de l'orchestrateur concerne le livrable final.
Les workers ordinaires reçoivent seulement leurs obligations explicitement
affectées ; un observateur n'hérite pas des exigences de l'auteur.

Pour l'A-Team, le contrat collectif est affecté à un véritable membre
terminal d'intégration avant son lancement. Ce membre consomme les contributions
par des handoffs vérifiés, utilise son propre run et son budget et délivre
l'artefact final. `qualityRuntime.finalArtifactMemberId` peut le sélectionner
par identité ou alias non ambigu ; sinon un terminal unique est exigé.
Il doit couvrir transitivement tous les autres producteurs. Aucun worker ni
budget n'est ajouté implicitement. Plusieurs sorties indépendantes exigent
une organisation d'intégration explicite, pas une concaténation de rapports.

La clôture vérifie le dernier run du membre, sa complétion native, son autorité
postérieure à la formation et son reçu exact. `gqel_final_artifacts` conserve
l'artefact signé et `finalQuality` expose le résultat. L'invariant de qualité
finale s'ajoute aux exigences d'intégration, d'oracle et de couverture.
Le parcours local de synthèse de l'orchestrateur applique aussi son contrat
de premier niveau avant la publication de son résultat.
Le bootstrap choisit son type d'artefact avant le scellement, puis conserve
l'exécution des workers et de la barrière avant la synthèse finale native.
Un exécuteur résolu non local, même choisi par défaut ou par l'environnement,
est refusé avec `GQEL_EXECUTOR_UNSUPPORTED`. Pour le code final, le parcours
protégé et ses droits d'édition doivent être explicitement autorisés ; une
synthèse textuelle ne remplace pas des sources et des tests exécutés.

## Portée et validation

Le raccord d'exécution automatique décrit ici concerne le runtime Node local.
Chaque harness externe doit disposer d'un adaptateur équivalent et de preuves
valides ; le contrôle d'artefact seul ne lance pas sa boucle. Les actions directes
de topologie sans synthèse globale raccordée refusent une obligation globale
avec `GQEL_FINAL_INTEGRATION_REQUIRED`. Utiliser le parcours natif `orchestrate`
ou déclarer les contrats des workers concernés. Une obligation globale multiteam
exige une étape finale équivalente ; les succès des sous-équipes seuls sont refusés.
Aucune exécution GQEL Rust
universelle n'est revendiquée.

```bash
node backend/tests/test_quality_elevation_loop.js
```

Cette commande couvre contrôleur, contrats natifs, routage et budgets, reçus et
redémarrage, code, coordination A-Team, artefact final et synthèse native. Les
réponses modèles des tests sont synthétiques. Elles vérifient les mécanismes,
pas un gain artistique ou une supériorité sur un modèle seul.

Décisions : [contrats](../adr/0771-gqel-contrats-natifs-de-mission.md),
[exécution native](../adr/0772-gqel-execution-native-des-workers.md),
[preuves durables](../adr/2026-11-02-gqel-recus-qualite-durables.md),
[coordination](../adr/2026-11-02-gqel-coordination-des-reparations.md) et
[livrable final](../adr/0773-gqel-livrable-final-integre.md).
