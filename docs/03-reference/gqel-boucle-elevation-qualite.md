# GQEL V2.1 — progression, réparation locale et preuve exacte

- **État** : correctifs logiciels testés sur un snapshot ciblé ; essai Ollama et validation artistique à effectuer.
- **Base inspectée** : `6fa045396e15bb3ab5d1adedcb8d64a7e5cebe11`.
- **Historique** : [référence V2](gqel-v2-2026-11-02.md), [référence V1](gqel-v1-2026-11-02.md).
- **Preuves** : [validation ciblée](../06-qualite-preuves/gqel-v2-1-validation-2026-11-02.md).

## Ce qui change

Une difficulté de format, une objection au plan et un défaut du scénario ne sont plus traités comme le même événement.

```text
contrat figé → contrôles des lecteurs → plan structuré
  → contrôle et réparation locale du plan
  → plan acceptable OU autorisation limitée de brouillon provisoire
  → rédaction scène par scène et conservation des brouillons
  → évaluation du texte complet sur TOUS les critères
  → correction / comparaison / promotion bornée ou arrêt sans promotion
```

**Autoriser à rédiger du texte n'autorise pas à livrer.** Seul le verdict complet du texte, lié à son empreinte et au contrat,
peut produire une promotion. Aucun effet externe, déploiement, lease, droit outil ou changement d'autorité n'est autorisé par le mode provisoire.

## Contrat et compteurs

`compileQualityContract` conserve le schéma `genos.gqel-contract/v2` et ajoute `controllerRevision: 2.1-progress`.
Les paramètres restent validés, gelés et inclus dans l'empreinte du contrat.

| Paramètre | Défaut compilé | Sens |
|---|---:|---|
| `maxProtocolRepairs` | 2 | Reprises locales supplémentaires d'une réponse structurée ou d'un en-tête de scène invalide. |
| `maxPlanRepairs` | 1 | Corrections locales supplémentaires d'un plan, dans un même tour de production. |
| `allowProvisionalDraft` | true | Autorise seulement le brouillon textuel d'un scénario après ces corrections, même si un avis de plan reste négatif. |

Un contrat ancien sans ces champs conserve zéro reprise locale et n'autorise pas le mode provisoire. Recompiler le contrat pour la nouvelle politique.
Les plafonds globaux d'appels, tokens, temps, contexte, sortie et mutations restent applicables à toutes les reprises.
Une reprise de protocole n'incrémente pas `rounds`, mais consomme bien des appels, du temps et des tokens.

Le résultat expose `progress` : `artifactRounds`, `planRepairs`, `protocolRepairs`, `plansProduced`, `scenesWritten`, `draftsProduced`, `versionsReviewed`.
Un tour peut encore échouer avant de produire un artefact. Le compteur ne prouve donc pas qu'un scénario a été écrit.
`session.protocolAttempts` conserve statut, diagnostic, empreinte et réponse invalide comme donnée non fiable.

## Protocole et schémas

`qualitySchemas.js` construit des schémas pour plan, lecture et comparaison. L'adaptateur Ollama les transmet dans `format`,
plutôt que seulement `"json"`. Le runtime valide encore les réponses : la génération contrainte ne certifie pas leur contenu.
Les octets du schéma participent aux bornes conservatrices de contexte et de réservation.

`qualityProtocol.js` relance le même rôle sur le même artefact et la même grille après une réponse invalide, en lui fournissant
le diagnostic et sa réponse précédente comme données. Il ne transforme jamais un refus sémantique en réussite.
Timeouts, usage manquant, changement de modèle, dépassements de ressources et sorties tronquées ne sont pas des erreurs de format à rejouer.

## Ancrage des citations

`findSubPhrase` est supprimé. Une citation doit être entièrement présente, à la tolérance de retrait des blancs externes près.
Plusieurs passages demandent plusieurs citations ; le runtime ne recolle pas des phrases ni ne remplace une citation par son fragment commun.

Contre-exemple testé : « Alain accepte de sortir de la station. » doit être refusé lorsque la source dit
« Alain refuse de sortir de la station. ». L'ancienne recherche acceptait le suffixe « de sortir de la station. ».
Une citation exacte ne prouve toujours pas que le raisonnement critique est juste.

## Phase plan et estimation de durée

Le juge de plan examine les règles, alternatives, choix et conséquences **prévus**. Il n'exige plus une scène déjà rédigée dans un plan.
Le juge final exige leur réalisation dans les scènes. Les personnages peuvent partager un objectif ; leurs moyens, connaissances,
valeurs ou risques peuvent produire leurs divergences. L'opposition d'objectifs n'est pas une exigence universelle.

Quatre contrôles initiaux vérifient : action seulement annoncée, action représentée, objectif partagé avec décisions distinctes,
et résumé causal approprié à la phase plan. Ces contrôles sont des tests de bon fonctionnement, pas une calibration générale du critique.
Les lecteurs sur un même modèle restent corrélés et ne deviennent pas un jury indépendant parce qu'ils ont des rôles différents.

`qualityPlanValidation.js` distingue structure exploitable et écart de rythme. `validatePlan` reste strict pour ses appelants.
Le parcours interne peut conserver les durées proposées et calculer un `pacingGuide` dont les suggestions totalisent la cible.
**Les durées d'origine ne sont pas réécrites.** Le guide demande une adaptation du contenu ; il ne certifie ni timing réel ni qualité.
Un écart persistant reste inscrit dans les obligations du brouillon. Le critère final `duration_supported` reste obligatoire lorsqu'une durée est demandée.

## Plans provisoires, relectures et conservation

Après une réparation locale bornée, une objection sémantique persistante peut conduire à `PROVISIONAL_DRAFT_AUTHORIZED` pour le profil `screenplay`.
L'événement conserve le digest du plan, les objections et `acceptedForDelivery: false`. La scène reçoit ces obligations à résoudre.
Un plan structurellement inexploitable ne reçoit pas cette autorisation. `--strict-plan=true` maintient le veto intégral de plan.

Chaque scène produite est conservée avant l'appel suivant. Un brouillon complet est conservé **avant** sa lecture finale.
Une panne du juge ne fait plus disparaître le texte disponible. Un échec de persistance interdit toujours la promotion.

Les critères durs inconnus ou échoués, les défauts structurels et le seuil qualitatif continuent à bloquer la livraison.
La comparaison contre la meilleure version, l'inversion d'ordre A/B puis B/A et l'enforcement worker demeurent applicables.
Une citation inventée lors de la comparaison peut être corrigée localement, mais jamais acceptée par rapprochement approximatif.

## Exécution

```bash
node backend/tests/test_gqel_v2.cjs
node backend/tests/test_gqel_progress.cjs
node backend/tests/test_quality_elevation_loop.js
node scripts/experiments/run_writing_mission_gqel.cjs --model=llama3.1:8b --out=artifacts/gqel-v2-1-run
```

La troisième commande conserve aussi l'assertion A-Team native et exige le checkout complet.
Le pilote conserve 20 minutes, 6 scènes minimum, 1 200 mots minimum, 4 tours, 100 appels et 160 000 tokens par défaut.
Ces nombres sont des paramètres d'essai, pas une preuve de durée ou un optimum expérimental.

Options supplémentaires : `--protocol-repairs=2`, `--plan-repairs=1`, `--strict-plan=true`.
Options conservées : `--model=`, `--judge-model=`, `--minutes=`, `--scenes=`, `--min-words=`, `--iterations=`, `--tokens=`,
`--context=`, `--policy=`, `--brief=`, `--out=`. Sans `--judge-model`, le même modèle écrit et évalue.

Le répertoire doit être nouveau. Il contient contrat, checkpoints, rapport, versions évaluées, `draft-N-unaccepted.md` et
`scene-draft-N-unaccepted.md`. `screenplay.md` est réservé à une promotion. Sinon le meilleur candidat disponible est dans
`candidate-not-accepted.md` ; un échec avant tout brouillon laisse seulement les traces et plans éventuels.
Codes de sortie : 0 accepté, 2 non accepté, 1 erreur de lancement. Ne pas committer ces sorties générées.

## Limites inchangées

La validation repose sur les lecteurs configurés, pas sur un oracle universel du goût. `demonstratedGain` reste `null`,
`humanValidated` et `causalUpliftVsModelAlone` restent faux. Les reprises logicielles testées ne démontrent pas un gain narratif sur Ollama.
La génération réelle n'a pas été exécutée pendant cette livraison.

Le pilote ne prétend pas activer nativement AGOW, GQWF, GVX ou Morphogenèse. Les besoins de routage déjà exposés ne sont pas des invocations.
Le reçu worker reste en mémoire ; un redémarrage exige une vérification fraîche. Pas de reprise automatique à partir d'un checkpoint désérialisé.
Les adaptateurs de confiance doivent respecter les limites et l'annulation ; cette boucle n'est pas un sandbox pour callbacks hostiles.
