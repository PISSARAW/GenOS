# GQEL : régressions et mesure d'amélioration

La documentation V1 est conservée dans [README.v1.md](README.v1.md).
Le benchmark historique utilisait trois textes prédéfinis et un évaluateur lexical,
sans appeler un modèle. Ses scores établissaient cette simulation, pas un gain
causal de GenOS. `benchmark_results.json` reste inchangé comme artefact historique.

## Régressions V2

```bash
node benchmarks/gqel-elevation/run_elevation_benchmark.cjs
```

Le programme exécute les tests V2 et déclare explicitement les réponses synthétiques.
Il n'écrase aucun résultat historique. Des cas positifs testent la réparation, la
comparaison dans les deux ordres et la production plan→scène→lecture finale.

## Mission réelle à exécuter

```bash
node scripts/experiments/run_writing_mission_gqel.cjs --model=llama3.1:8b --out=artifacts/gqel-v2-run
```

Le répertoire doit être nouveau. Versions, plans, avis, usages et décisions sont
conservés. `promoted` signifie satisfaction du contrat borné par les contrôles
configurés, pas qualité artistique certifiée. `observedRubricDelta` décrit un delta
de grille ; `demonstratedGain` reste `null`.

## Campagne confirmatoire proposée, non exécutée

Geler plusieurs briefs avant de régler le contrôleur. Comparer le même modèle,
version, outils et paramètres dans quatre bras : génération directe ; planification
et révision sans GQEL ; plusieurs candidats puis sélection ; GQEL complet. Comparer
à budget total égal, juges inclus, et séparément le coût pour atteindre une qualité.
Contrebalancer les ordres, répéter les essais et réserver des briefs hors réglage.

Des lecteurs humains évaluent les œuvres anonymisées, sans provenance, note ou
version. Conserver préférences, désaccords, contraintes violées, faux succès,
faux rejets, régressions, temps, tokens, interventions et échecs. Les échecs restent
dans le dénominateur. Les intervalles de confiance tiennent compte du regroupement
par brief. Déterminer la taille selon le gain minimal et une analyse de puissance.

Ablations : sans plan, sans critiques, sans citations, sans inversion d'ordre,
sans protection de la meilleure version. Une fixture réussie ne prouve aucun gain
artistique ni supériorité face au modèle seul.
