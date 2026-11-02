# GQEL V2 — construction, critique localisée et réparation bornée

**Statut :** contrôleur et parcours narratif implémentés ; génération réelle et
qualification humaine à exécuter. La [référence V1](gqel-v1-2026-11-02.md) est
archivée. Les guides V1 décrivent l'ancien contrat ; cette référence décrit V2.

## Architecture

Contrat figé → contrôles des lecteurs → plan causal → lecture du plan → rédaction
scène par scène → lectures intégrales → défauts localisés → réparation de l'étape
responsable → comparaison à la meilleure version → acceptation ou arrêt explicite.

Les scanners synchrones ne rendent plus de score artistique : `score: null`,
`valid: false`, `structuralPassed` séparé. Des mots-clés, titres ou commentaires
`// Test:` ne prouvent ni dramaturgie ni tests exécutés. Les motifs suspects sont
des pistes de contrôle, pas une preuve automatique de défaut sémantique.

## Contrat

`compileQualityContract()` produit un objet V2 gelé et une empreinte du contenu
normatif. Ajouter un critère ne permet pas d'écraser un critère obligatoire.
Les nombres, bornes et booléens sont validés. Les contrats V1 doivent être recompilés.
L'empreinte assure l'intégrité, pas une signature indépendante d'autorité.

| Politique | Tours | Lectures | Seuil | Comparaison dans les deux ordres |
|---|---:|---:|---:|---|
| fast | 2 | 1 | 70 | non |
| balanced | 3 | 2 | 80 | oui |
| critical | 5 | 3 | 95 | oui |

Les notes ordinales 0–4 sont présentées via les ancres 0,25,50,80,100 : inexploitable,
embryonnaire, à réécrire, solide, très abouti. Ni ces ancres ni les seuils ne sont
scientifiquement calibrés. Une bonne note ne compense jamais un critère dur échoué
ou inconnu. Une note inconnue reste `null`.

Les plafonds incluent tokens, appels, durée totale, timeout par appel, sortie,
contexte et changements de stratégie. Les mutations ne prolongent pas le nombre
autorisé de tours. Tous les appels, y compris critiques et comparaisons, sont comptés.

`minSceneCount`, `maxSceneCount`, `minBodyWords`, `targetMinutes` sont des contraintes
de commande. La bibliothèque n'impose pas universellement plusieurs personnages ou
des dialogues. Le décompte de mots et les minutes prévues ne sont pas un chronométrage.

## Construction narrative

Le plan explicite règles, motivations, connaissances, objectifs, obstacles, décisions,
conséquences et état après chaque scène. Sa lecture est distincte de celle du scénario
final : un plan acceptable ne prouve pas que les intentions sont réalisées.

Le générateur reçoit le plan et les scènes antérieures intégrales. Le contexte n'est
plus tronqué à 4 000 caractères. Si la limite de contexte est dépassée, la boucle
s'arrête explicitement, sans supprimer silencieusement le début du texte.

Une erreur de causalité ou de motivation renvoie au plan ; une erreur de scène invalide
la scène et les suivantes. Les scènes antérieures non touchées peuvent être conservées.
Une stagnation provoque, sous quota, une nouvelle planification indépendante.

## Lectures et comparaison

Les lecteurs sont des callbacks configurés par le runtime de confiance, pas des
fonctions ou instructions fournies dans le texte du modèle. Chaque lecture reçoit
un contexte neuf, la grille et l'artefact, sans les notes antérieures. Pour un scénario,
le corps des scènes est évalué, pas les notes d'autoéloge placées autour.

Réponse : `checks`, exactement une entrée par critère, avec `criterionId`, `verdict`
(`pass|fail|unknown`), `reason`, `evidence:[{quote:...}]`, et `rating` pour les critères
souples connus. Les citations doivent être réellement présentes. Les positions sont
relatives à `citationScope`. Une citation exacte ne garantit pas un jugement correct.
Un avis incomplet ou non étayé ne peut pas autoriser une promotion.

Deux contrôles initiaux, positif et négatif, détectent l'approbation ou le rejet
systématiques. Ils ne certifient pas un juge général. Les groupes de dépendance sont
fusionnés lorsque le modèle ou le groupe déclaré coïncide. Plusieurs rôles sur un
même LLM restent corrélés ; `minDependencyGroups` peut exiger plusieurs groupes.

La comparaison A/B puis B/A appelle réellement le juge et exige des citations des
deux textes. L'option historique `requireDoubleBlind` signifie ici anonymisation des
étiquettes et inversion d'ordre, pas expérience humaine en double aveugle. Un avis
instable ne remplace pas la meilleure version. Les régressions sont contrôlées contre
cette meilleure version, pas contre une tentative intermédiaire déjà dégradée.

## Adaptateurs et budget

```javascript
const result = await executeElevationLoop({ contract, generator, reviewers });
// Chaque adaptateur retourne :
return { content, usage: { inputTokens, outputTokens },
  finishReason: 'stop', model: 'nom-exact-du-modele' };
```

Les réponses brutes non mesurées ne sont plus acceptées. Les appels reçoivent `signal`
et `maxOutputTokens`. Les adaptateurs doivent respecter annulation et limites ; un
callback malveillant n'est pas un sandbox. La réservation préalable est conservatrice
en octets ; l'imputation finale utilise l'usage déclaré par le fournisseur. Une erreur
sans usage fiable impute la réservation et marque la comptabilité incomplète. Une
surconsommation du fournisseur est détectée après l'appel, pas annulée rétroactivement.

L'adaptateur Ollama vérifie HTTP, réponse complète, modèle observé exact, usage,
contexte et motif de fin. `length` ne devient pas une réussite.

Pour le code, le scanner compile sans exécuter. Le callback `verifier`, fourni par
le runtime, doit lancer les tests protégés dans l'environnement isolé existant et
renvoyer `{artifactDigest, executed, passed, evidenceRefs}` dans une enveloppe d'usage.
GQEL ne donne aucune permission shell supplémentaire.

## Intégration GenOS et autorité

La façade `backend/src/services/qualityElevationService.js` est conservée.
Le hook de `workerArtifactContract.js` reste synchrone. L'intégrateur compile le
contrat V2, l'affecte à `worker.workerContract.qualityElevation`, puis transmet le
même objet `worker` à `executeElevationLoop`. Une réussite lie un reçu en mémoire au
worker, au contrat et au hash exact du livrable. Des champs `passed` ou `score` du
modèle, ou un JSON désérialisé, ne peuvent fabriquer ce reçu. Texte ou contrat modifié
l'invalident. Après redémarrage, une nouvelle vérification est exigée.

L'obligation A-Team `pending_repair` est conservée ; elle ne relance pas seule un
worker. Le pilote GQEL exécute la boucle avec ses adaptateurs. Le raccord automatique
à tous les dispatchs A-Team reste à qualifier. Les champs `integrationNeeds` sont des
besoins de routage, pas des invocations natives d'AGOW, AEIS, GQWF ou Morphogenèse.

## Exécution réelle

```bash
node backend/tests/test_gqel_v2.cjs
node backend/tests/test_quality_elevation_loop.js
node scripts/experiments/run_writing_mission_gqel.cjs --model=llama3.1:8b --out=artifacts/gqel-v2-run
```

Le pilote vise 20 minutes, au moins 6 scènes et 1 200 mots de continuité. Ces bornes
anti-résumé sont propres à cet essai, pas des mesures de talent ou de durée.
Options : `--minutes=`, `--scenes=`, `--min-words=`, `--iterations=`, `--tokens=`,
`--context=`, `--policy=`, `--judge-model=`, `--brief=`, `--out=`.

Sans `--judge-model`, auteur et lecteurs utilisent le même modèle, avec corrélation
explicitée. Plafonds du pilote : 160 000 tokens, 100 appels, 4 tours, une heure totale,
5 minutes par appel. Ce sont des limites configurées, pas des estimations de durée.

Le répertoire doit être nouveau. Il contient contrat, versions immuables, checkpoints
et rapport. Le livrable accepté est `screenplay.md`, sinon `candidate-not-accepted.md`.
Sorties processus : 0 accepté, 2 non accepté, 1 erreur de lancement. Les checkpoints
sont inspectables mais n'autorisent pas une reprise aveugle. Ne pas committer les
artefacts générés.

## Portée des conclusions

`promoted` signifie contrat borné satisfait par les contrôles configurés.
`observedRubricDelta` est un delta de grille. `isImproved` exige une préférence stable.
`demonstratedGain` reste `null`, `causalUpliftVsModelAlone` et `humanValidated` restent
faux. La vraie qualité et le gain contre le modèle seul exigent une campagne externe.

Voir l'[ADR](../adr/2026-11-02-gqel-v2-controle-et-construction.md), la
[validation](../06-qualite-preuves/gqel-v2-validation-2026-11-02.md) et le
[benchmark](../../benchmarks/gqel-elevation/README.md).
