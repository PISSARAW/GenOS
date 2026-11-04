# ADR — Relier une inspection ETT complète à une mission native

- **Date :** 2026-11-04
- **Statut :** implémenté pour une inspection structurelle bornée
- **Périmètre :** services Node internes ; contexte consommable par une mission

## Problème

La première relance intégrée du « Dernier Sas » conservait une observation,
une question et une admission ETT. Elle n'exécutait ni tâche ETT, ni oracle,
ni apprentissage. Ajouter cette question au brief ne prouvait donc aucune
chaîne ETT complète. Une question libre de modèle ne peut pas non plus être
déclarée vérifiée à partir d'un comptage de mots.

## Décision

`endogenousThoughtMissionService.run(db, input)` compose la boucle ETT
canonique avec une observation réelle et des ports d'exécution fixes. Il
exige une mission native active, un agent appartenant à cette mission et au
tenant, un fichier confiné au workspace de cet agent, son SHA-256, des
exigences explicites et une autorité SHEV déjà enrôlée. Il ne crée ni ne
remplace silencieusement une responsabilité ou une clé.

L'hypothèse normative est précise : l'artefact identifié ne satisfait pas
les exigences structurelles identifiées. Les exigences portent sur le nombre
minimal de mots et de scènes, le plafond de scènes et la présence de dialogue.
Le générateur de question optionnel peut reformuler la question. Il ne peut
substituer ni l'hypothèse, ni la méthode, ni le falsificateur, ni un verdict.

Un premier processus mesure le fichier afin d'étayer l'observation. La boucle
réelle crée ensuite la tâche, réserve son exécution et lance un nouveau
processus d'inspection. Un troisième processus, doté d'une autre implémentation
de la mesure, réfute ou soutient l'hypothèse depuis le même texte. Le contrôleur
signe l'attestation de ce résultat sous une clé distincte de l'autorité SHEV
et du producteur. Les autorisations d'exécution, de vérification et
d'apprentissage sont signées par l'autorité enrôlée. Aucune fonction de
vérification ni aucun verdict fourni par l'appelant n'est accepté.

Les programmes sont des sources fixes du dépôt. Ils exécutent une fonction
pure dans une VM sans `require`, `process` ou `fetch`, sans génération de code,
avec limites de mémoire, de sortie et de temps. Node refuse les écritures de
fichiers et limite les lectures au répertoire des programmes. Le texte est
transmis comme données, jamais comme code. Cette frontière qualifie ces deux
programmes fixes ; elle n'est pas un service d'exécution de JavaScript hostile.

La chaîne doit atteindre `VERIFIED`, `LEARNED` puis `STOPPED`. Une réfutation
réelle applique la révision négative canonique. L'apprentissage exige une
mémoire réellement persistée ; l'index lexical local explicite évite un appel
d'embedding réseau hors budget. Il ne devient pas un embedding sémantique.
Le coût de modèle des inspections vaut zéro ; leurs durées réelles sont
mesurées. Un éventuel appel LLM de formulation est financé et mesuré séparément
par le contrôleur de mission. Le budget temporel du service couvre également
l'observation, l'oracle et la persistance.

L'option interne `useWallClock` fait dater les étapes réelles et la fin du run
après le retour du processus. Le mode logique explicite des campagnes et
tests historiques reste disponible. Un index mémoire `local-lexical`
n'affecte ni le verdict, ni les gates de preuve, ni la promotion.

## Consommation et preuve

Un reçu HMAC lie tenant, mission, agent, fichier exact, exigences, épisode,
mesures, programmes exécutés, verdict, reçus natifs et mémoire. La relecture
vérifie les contrats et les empreintes des reçus natifs, la signature de
vérification, leur lignée, les transitions de l'épisode et la mémoire.
Une preuve supprimée, un autre tenant ou une source modifiée provoque un refus.

`buildContext(db, reference)` exige encore une mission active avant de produire
un contexte de mesures et ses références exactes. Le raccord d'orchestration
doit incorporer ce contexte au travail autorisé et vérifier sa présence dans
la requête réellement consommée. `read(db, reference)` permet aussi un audit
historique scopé après la fin de mission ; il n'autorise aucun nouveau travail.

```javascript
const ett = require('./backend/src/services/endogenousThoughtMissionService');
const result = await ett.run(db, {
  organizationId, projectId, agentId, missionId,
  artifact: { path: baselinePath, sha256: baselineDigest },
  requirements: { minWords: 1200, minScenes: 5, maxScenes: 7, requireDialogue: true },
  authority: { privateKey: enrolledAuthorityKey, grantedBy: operatorId },
  budget: { tokens: 1000, usd: 0, seconds: 120 },
  dimension: 'artifact_structure'
});
const context = await ett.buildContext(db, {
  organizationId, projectId, agentId, missionId, receiptId: result.receiptId
});
```

Le mandat doit contenir la dimension demandée. Un mandat imposant un observateur
endogène signé est refusé par cet adaptateur tant qu'un tel observateur n'est
pas fourni ; cette exigence n'est pas désactivée. Une reprise ambiguë d'exécution
après perte du processus hôte reste refusée sans résultat recouvrable.

## Limites et validation

Ces mesures ne certifient ni dramaturgie, ni qualité artistique, ni durée de
représentation, ni cause de l'amélioration. Les champs correspondants restent
explicitement faux. Un résultat positif porte sur la proposition structurelle
bornée, et ne remplace aucun gate GQEL ou gate de promotion de mission.

`node backend/tests/test_endogenous_thought_mission.cjs` exécute les processus,
l'oracle, les signatures, les transitions et la mémoire réels. Il couvre aussi
une hypothèse réfutée, une preuve native supprimée, une empreinte altérée,
une autre mission, une autre clé, une source sortante ou modifiée, un callback
d'exécution interdit et la consommation refusée après clôture. Aucun appel
LLM ni résultat de modèle synthétique ne sert de preuve de cette chaîne.
