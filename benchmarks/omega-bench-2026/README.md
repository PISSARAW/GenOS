# OMEGA-BENCH 2026 — banc préparé

Ce dépôt de benchmark est séparé du code G-CIR Ω : le générateur, les cas, les oracles et l'évaluateur n'importent aucun module GenOS. Il fournit un corpus synthétique déterministe de **2 800 cas** avec entrées candidates et réponses de référence dans des fichiers distincts. E01/E02 ont 200 cas chacun; E03/E08 en ont 1 000 chacun; les autres expériences en ont 50.

**État : qualifications A/B exécutées; C partiellement qualifiée; campagne comparative bloquée.** Le corpus reste un jeu de développement public, pas un jeu caché ni une preuve de performance. Les seuils du protocole sont des hypothèses à confirmer avant lancement. Les volumes proposés entraînent `2 800 scénarios × 4 conditions × 3 répétitions = 33 600 exécutions`, avant baselines, ablations, tests de charge ou calcul de puissance.

## Contenu

- `protocol.json` : conditions, facteurs contrôlés, seuils proposés et limites du pilote.
- `dataset/public/inputs/` : cas que les adaptateurs peuvent lire.
- `dataset/oracle/` : réponses attendues séparées des entrées.
- `schemas/` : contrats du cas et du résultat d'adaptateur.
- `src/generate_dataset.py` : régénération déterministe du corpus.
- `src/evaluate.py` : comparaison exacte des réponses, détection des cas manquants/dupliqués et résumé descriptif.
- `adapters/README.md` : contrat à implémenter pour chaque baseline.
- `statistics/plan.md` : analyses prévues et limites d'inférence.
- `results/README.md` : statut des résultats.

## Générer et évaluer

Depuis ce dossier, Python 3.12+ et sa bibliothèque standard suffisent :

```powershell
python src/generate_dataset.py
node src/run_e03_pilot.cjs
node adapters/json_reference.cjs
node adapters/gcir_minimal.cjs
python src/evaluate.py --results chemin/vers/resultats.jsonl --condition A
python src/evaluate.py --results results/E03-pilot.jsonl --condition A --experiment E03
```

Avant de présenter ou lancer la campagne confirmatoire complète, exécuter
`python src/check_readiness.py`. Le contrôle échoue tant que les volumes proposés,
les conditions A–D, les baselines, les configurations communes, le préenregistrement
et le jeu caché ne sont pas prêts. Il n'empêche pas les qualifications descriptives A/B.

Le fichier de résultats contient une ligne JSON par cas et répétition. Le format requis est décrit dans `schemas/result.schema.json`. Les clés d'oracle ne doivent jamais être ajoutées au prompt ou à l'entrée de l'adaptateur. L'évaluateur lit uniquement `dataset/oracle/` au moment du score.

## Interprétation

Les comparaisons sont appariées par `scenario_id` et répétition. Un résultat de succès est une égalité exacte de la réponse normalisée et ne prouve pas à lui seul un effet de production. Les métriques de latence, d'octets, de tokens et de coût sont rapportées séparément. Les traces et reçus devront être conservés par chaque adaptateur. Les sorties invalides, manquantes ou dupliquées restent dans le dénominateur et sont signalées.

Le corpus est indépendant du runtime par construction, mais il est synthétique, public et généré localement. Les conditions répondent à des questions sémantiques communes dans `answer`; les métriques propres à une optimisation doivent être rapportées dans `metrics` et comparées séparément, pour ne pas compter une capacité désactivée comme une erreur sémantique. A, B et C ont chacune exécuté 8 400 passages sur le corpus v0.2.0, avec 100 % de conformité oracle. B réutilise les handlers déterministes de référence derrière le compilateur et le runtime Omega; C applique une fusion d'additions à E04 et valide statiquement les enveloppes. Ces qualifications ne démontrent pas un gain comparatif. Le pilote E03 compare AJV au validateur Omega. Aucun de ces résultats ne conclut à la supériorité de G-CIR Ω. Ce corpus ne permet pas de prétendre à une validation cachée, à une généralisation métier ou à une indépendance tierce.
