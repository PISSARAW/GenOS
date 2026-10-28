# OMEGA-BENCH 2026 — banc préparé

Ce dépôt de benchmark est séparé du code G-CIR Ω : le générateur, les cas, les oracles et l'évaluateur n'importent aucun module GenOS. Il fournit un corpus synthétique déterministe de **3 400 cas** avec entrées candidates et réponses de référence dans des fichiers distincts. E01/E02 ont 200 cas; E03/E08 en ont 1 000; E04/E05/E10/E12 en ont 100; E06 en a 150 (trois taux de panne); E07/E09 en ont 200 (quatre échelles); E11 en a 50.

**État au 2026-10-28 : campagne publique exploratoire A/B/C/D exécutée.** Les quatre conditions totalisent 40 800 exécutions sur les 3 400 cas, trois répétitions par cas : 40 800/40 800 conformes à l'oracle, sans manque, doublon, statut invalide ni échec critique. Les sept baselines ont 25 800 exécutions qualifiées sur leurs portées déclarées. Les huit ablations ont des contrôles publics ciblés; A2 et A4 sont explicitement limitées à des comparaisons compilateur/runtime et harness-level, A7 n'atteint pas le seuil médian de 30 %. Le stress E09 a traité 33 330/33 330 invocations asynchrones jusqu'à 10 000 invocations simultanées dans un processus Node. Voir les rapports sous `reports/` pour les portées et limites.

**La campagne confirmatoire n'est pas autorisée par le préflight.** Il reste 24/26 contrôles passés : statut de préenregistrement et trois éléments ouverts (gel final du protocole/corpus, mesure E11 en euros et puissance/marges finales). La VM partagée ne fournit aucun compteur d'énergie attribuable; aucun résultat €/mission ni gain de 15 % n'est revendiqué. Le holdout de 680 cas reste scellé et n'a pas été scoré. Les résultats publics sont descriptifs et ne démontrent ni supériorité ni effet de production.

## Contenu

- `protocol.json` : conditions, facteurs contrôlés, seuils proposés et limites du pilote.
- `dataset/public/inputs/` : cas que les adaptateurs peuvent lire.
- `dataset/oracle/` : réponses attendues séparées des entrées.
- Le holdout local (680 cas) et sa graine sont dans le profil privé de l'assesseur, hors dépôt; les adaptateurs ne reçoivent pas ces fichiers.
- `schemas/` : contrats du cas et du résultat d'adaptateur.
- `src/generate_dataset.py` : régénération déterministe du corpus.
- `src/generate_holdout.py` : création idempotente et vérification du jeu caché local, à partir d'une graine privée.
- `src/evaluate.py` : comparaison exacte des réponses, détection des cas manquants/dupliqués et résumé descriptif.
- `src/evaluate_holdout.py` : scoring du holdout après gel des sorties candidates; les données et la graine privées ne sont pas versionnées.
- `adapters/README.md` : contrat à implémenter pour chaque baseline.
- `adapters/mcp.cjs` : baseline MCP exécutée sur E07/E12; voir `reports/perimetre-baselines.md` pour la portée fonctionnelle des sept familles.
- `statistics/plan.md` : analyses prévues et limites d'inférence.
- `results/README.md` : statut des résultats.

## Générer et évaluer

Depuis ce dossier, Python 3.12+ et sa bibliothèque standard suffisent :

```powershell
python src/generate_dataset.py
python src/generate_holdout.py
node src/run_e03_pilot.cjs
node adapters/json_reference.cjs
node adapters/gcir_minimal.cjs
python src/evaluate.py --results chemin/vers/resultats.jsonl --condition A
python src/evaluate.py --results results/E03-pilot.jsonl --condition A --experiment E03
```

Pour qualifier les adaptateurs sur le holdout, définir `OMEGA_DATASET_ROOT` vers
`~/.codex/benchmark-secrets/omega-bench-2026/holdout-v0.4.0` et
`OMEGA_DATASET_INPUTS` vers son sous-dossier `inputs/`, puis lancer l'adaptateur
avec un chemin de sortie distinct. Après fermeture et gel des sorties, appeler
`python src/evaluate_holdout.py --condition A --results <sortie.jsonl>`.
Le scorer vérifie le manifeste privé avant de lire l'oracle et émet un hash des
sorties évaluées. Ne pas lancer ce scoring avant le préenregistrement.

Avant de présenter ou lancer la campagne confirmatoire complète, exécuter
`python src/check_readiness.py`. Le contrôle échoue tant que les volumes proposés,
les conditions A–D, les baselines, les configurations communes, le préenregistrement
et le jeu caché ne sont pas prêts. Il n'empêche pas les qualifications descriptives A/B.

Le fichier de résultats contient une ligne JSON par cas et répétition. Le format requis est décrit dans `schemas/result.schema.json`. Les clés d'oracle ne doivent jamais être ajoutées au prompt ou à l'entrée de l'adaptateur. L'évaluateur lit uniquement `dataset/oracle/` au moment du score. Les JSONL et manifestes d'exécution restent dans `results/`, ignoré par Git; le compte rendu versionné et les empreintes figurent dans `reports/qualification-publique-2026-10-27.md`.

## Interprétation

Les comparaisons sont appariées par `scenario_id` et répétition. Un résultat de succès est une égalité exacte de la réponse normalisée et ne prouve pas à lui seul un effet de production. Les métriques de latence, d'octets, de tokens et de coût sont rapportées séparément. Les traces et reçus devront être conservés par chaque adaptateur. Les sorties invalides, manquantes ou dupliquées restent dans le dénominateur et sont signalées.

Le corpus est indépendant du runtime par construction, mais il est synthétique, public et généré localement. A, B et C utilisent les handlers déterministes de référence pour la plupart des tâches; C ajoute la validation d'enveloppe et une fusion d'additions sur E04. D raccorde les services réels de transition GenOS sur E10 et d'allocation physiologique sur E11; les autres tâches réutilisent C. Il ne prouve donc pas une intégration GenOS complète sur les douze expériences. Toutes les conditions sont déterministes et n'appellent aucun modèle externe. Les latences observées sur cet hôte partagé ne sont pas utilisées pour établir un avantage. L'évaluation n'est ni préenregistrée ni statistique confirmatoire; elle ne prouve ni généralisation métier, ni validation cachée, ni indépendance tierce.
