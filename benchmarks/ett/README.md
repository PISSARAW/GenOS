# ETT-BENCH 2026 — campagne expérimentale

**Statut :** protocole de campagne préparé, aucune comparaison scientifique de cette campagne exécutée. Ce dossier n'ajoute pas de boucle ETT parallèle : l'exécuteur scientifique délègue les propositions aux providers injectés et s'appuie sur le service ETT backend existant. Une réponse du modèle n'est jamais une preuve.

## Écart audité

L'ETT réel est déjà implémenté dans `backend/src/services/endogenousThought*` : détection, questionnement, admission, exécution isolée en lecture seule, vérification indépendante, apprentissage borné, mémoire et reprise. Le cycle est borné (jusqu'à 10 cycles selon la politique). Le runner `backend/bin/genos-ett-campaign.cjs` est un pilote synthétique de développement : son vérificateur dérive un verdict de la classe du scénario, ses mesures de coût sont nulles et ses reçus disent `scientificEvidence: false`. Il ne démontre donc aucune performance cognitive.

Le protocole scientifique v2 existant (`benchmarks/endogenous-thought/protocol-v2.json`) exécute seulement `full` contre `llm_only` sur un cas fourni par un adaptateur. Il exige un solveur, un vérificateur distinct et un mesureur de coûts externe. Il n'instancie pas les 12 épreuves ni les cinq ablations. Le protocole de cette campagne étend ces exigences sans transformer le pilote synthétique en résultat scientifique.

| Capacité demandée | État de l'implémentation antérieure | Statut de cette campagne |
| --- | --- | --- |
| ETT-01 / ETT-02 / ETT-04 / ETT-09 | Composants ETT réels disponibles ; aucun scénario de recherche scientifique correspondant avec oracle indépendant n'est exécuté par le runner de développement. | Priorités de scénario préenregistrées ; providers/scénarios encore nécessaires. |
| ETT-03, 05–08, 10–12 | Capacités partielles réparties dans le runtime, sans preuve de campagne pour chacune. | Contrats de scénario listés ; exécution non revendiquée. |
| ReAct, boucle périodique, Voyager, AI Scientist v2, DGM | Aucun adaptateur de benchmark attestant les systèmes originaux/adaptés dans ce dépôt. | Comparateurs indisponibles jusqu'à implémentation et audit de leurs adaptateurs. |
| Ablations A0–A5 | Certaines ablations de composants existent dans le pilote synthétique, mais pas cette matrice sur scénarios scientifiques à coût égal. | Définies dans `configs/ablations.yaml`, à raccorder à des configurations réelles. |

## Reproduction

Le pilote existant, qui ne produit que des indicateurs synthétiques, peut être rejoué avec :

```powershell
npm --prefix backend run test:ett
node benchmarks/ett/tests/test_statistics.js
node backend/bin/genos-ett-campaign.cjs --output benchmarks/ett/reports/development-pilot.json
```

Pour la campagne scientifique, un module provider réel doit exporter `protocol`, `metricSet`, `runtime`, `providers`, `replications` et `cases` selon les contrats de `backend/src/services/endogenousThoughtScientificCampaignService.js`. Le lanceur exige au moins 30 réplications indépendantes et les 36 paires épreuve × difficulté (12 × 3) ; le module ne peut donc pas lancer par inadvertance le petit corpus de contrat v2 à trois seeds. Il est chargé explicitement :

```powershell
node benchmarks/ett/run_campaign.js --adapter <chemin-vers-module-provider.js> --output <chemin-vers-recu.json>
```

Le service refuse les seeds non réservées, les exécutions non appariées, l'absence de vérificateur indépendant et l'absence de mesure externe. Ce chemin compare seulement `full` à `llm_only` ; il ne lance pas les autres systèmes ni les ablations A1–A5 listés dans les configurations. Chaque adaptateur supplémentaire exige une intégration explicite et des rapports séparés. La sortie demeure descriptive et non promotrice. L'exécuteur actuel transmet l'oracle au provider de vérification dans le même processus ; pour un holdout résistant à l'accès au secret, le vérificateur et le coffre d'oracles devront être isolés en processus et l'intégration devra être auditée avant qualification.

Les définitions des 12 épreuves et leurs niveaux sont dans `scenarios/*/scenario.json`. Chaque définition décrit l'observation, le résultat vérifiable et les contrôles de fuite/raccourci attendus. Elles ne sont pas encore des mondes simulés exécutables. Les comparaisons impossibles ou non configurées doivent rester absentes des résultats, jamais recevoir un score nul interprété comme échec.

## Verdict actuel

Aucun niveau ETT-L1 à ETT-L5 n'est qualifié par ce dossier. La continuité, le cycle borné et les contrats ont des tests fonctionnels existants, mais ils ne remplacent pas les expériences préenregistrées et les oracles indépendants. Aucun score, gain, intervalle de confiance ou classement n'est inféré de la présence de code.

Le pilote synthétique rejoué pour ce changement a traité 18 cas sur les 7 conditions existantes (126 tentatives), avec 21 échecs d'exécution au total (3 par condition) et 9 paires sans gain synthétique. Il rapporte zéro découverte validée et zéro coût mesuré dans chaque condition ; ces zéros signifient « non mesuré dans ce harnais », pas un résultat de performance. Le reçu complet et les erreurs sont dans [`reports/development-pilot.json`](reports/development-pilot.json). Il est `development_only`, `holdout: false`, `scientificClaimAllowed: false` et `promotionDecision: null`.

Les utilitaires statistiques fournissent le bootstrap hiérarchique apparié, la taille d'effet standardisée des différences appariées et la correction de Holm. Ils rejettent les observations, niveaux de confiance, répétitions et p-values invalides.
