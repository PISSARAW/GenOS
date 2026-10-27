# E03 — pilote de validation typée

Date : 2026-10-27 (Europe/Paris)  
Statut : **pilote exécuté; aucune conclusion sur la supériorité**

## Plan exécuté

- Corpus : 50 enveloppes G-CIR Ω v1 (25 valides, 25 invalides), répétées trois fois.
- Condition A : AJV 8.20.0 + ajv-formats 3.0.1, schéma `spec/g-cir-omega.schema.json`.
- Condition B : service réel `cognitiveOmegaInteropService.validate`.
- Exécutions : 150 par condition, 300 au total; paires alternées par cas et répétition, dix cas de chauffe non mesurés par condition.
- Modèle : aucun; cette expérience vérifie le schéma statiquement.
- Révision évaluée : `b899c3edde6361ee0dec0e86420884d49ba7f7ca`.

## Résultats observés

| Condition | Exactitude | Cas valides acceptés | Cas invalides rejetés | Latence p50 observée |
|---|---:|---:|---:|---:|
| A — AJV | 150/150 (100 %) | 75/75 | 75/75 | 0,0047 ms |
| B — Omega Node | 150/150 (100 %) | 75/75 | 75/75 | 0,68075 ms |

Les répétitions sont mesurées, mais les unités indépendantes sont 50 cas, pas 150 scénarios. Aucun intervalle de confiance ni test de significativité n'a été calculé. **Les latences ne sont pas une comparaison équilibrée** : AJV compile le schéma une fois avant la boucle mesurée, tandis que `cognitiveOmegaInteropService.validate` appelle `specValidator.validateSpec`, qui relit et revalide le fichier de schéma pour chaque candidat. Les p50 rapportés décrivent donc ces deux chemins précis; ils ne démontrent pas qu'Omega est généralement plus lent. Une comparaison de performance confirmatoire doit égaliser ou comptabiliser le coût de compilation/chargement du schéma et séparer le coût d'initialisation du coût par validation.

## Correctif déclenché par le pilote

L'audit du chemin d'exécution a révélé que `cognitiveOmegaInteropService.validate` normalisait l'enveloppe avant d'appliquer le schéma. Des champs v1 obligatoires absents, comme `state` ou `id`, pouvaient donc être ajoutés par défaut puis acceptés. La validation vérifie maintenant l'entrée brute avant d'utiliser sa forme normalisée. Des régressions couvrent les champs absents. Sur le corpus pilote après correctif, AJV et Omega rejettent les 25 enveloppes invalides.

## Artefacts et limites

- Résultats bruts : `E03-pilot.jsonl` (300 lignes).
- Manifeste de reproductibilité : `E03-pilot.manifest.json` (version Node, machine, empreintes et révision).
- Tests ciblés : `npm --prefix backend run test:interop` et `npm --prefix backend run test:omega` réussissent après le correctif.
- Le contrôle qualité complet du dépôt reste en échec sur la dette générale; le contrôle des fichiers indexés pour ce commit passe avec zéro violation.
- Aucun des autres onze tests, des conditions C/D, des baselines externes, des ablations ou du jeu caché n'a été exécuté.

Le seuil E03 proposé est atteint sur ce corpus public de pilote seulement. Les 500 cas valides/invalides annoncés dans le protocole détaillé, le préenregistrement et une réplication restent nécessaires pour une conclusion confirmatoire.
