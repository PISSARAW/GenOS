# OMEGA-BENCH 2026 — banc préparé

Ce dépôt de benchmark est séparé du code G-CIR Ω : le générateur, les cas, les oracles et l'évaluateur n'importent aucun module GenOS. Il fournit un corpus synthétique déterministe de **600 cas** (50 pour chacune des 12 expériences), avec entrées candidates et réponses de référence dans des fichiers distincts.

**État : préparé, non préenregistré et non exécuté.** Le corpus est un jeu de développement public, pas un jeu caché ni une preuve de performance. Les seuils du protocole sont des hypothèses à confirmer avant lancement. Le corpus de 50 cas par expérience permet de préparer le plan minimal `12 × 4 conditions × 50 cas × 3 répétitions = 7 200 exécutions`; il ne remplace pas les corpus plus grands indiqués dans certains protocoles (E01/E02/E03/E08) ni le calcul de puissance.

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
python src/evaluate.py --results chemin/vers/resultats.jsonl --condition A
python src/evaluate.py --results results/E03-pilot.jsonl --condition A --experiment E03
```

Le fichier de résultats contient une ligne JSON par cas et répétition. Le format requis est décrit dans `schemas/result.schema.json`. Les clés d'oracle ne doivent jamais être ajoutées au prompt ou à l'entrée de l'adaptateur. L'évaluateur lit uniquement `dataset/oracle/` au moment du score.

## Interprétation

Les comparaisons sont appariées par `scenario_id` et répétition. Un résultat de succès est une égalité exacte de la réponse normalisée et ne prouve pas à lui seul un effet de production. Les métriques de latence, d'octets, de tokens et de coût sont rapportées séparément. Les traces et reçus devront être conservés par chaque adaptateur. Les sorties invalides, manquantes ou dupliquées restent dans le dénominateur et sont signalées.

Le corpus est indépendant du runtime par construction, mais il est synthétique, public et généré localement. Les conditions répondent à des questions sémantiques communes dans `answer`; les métriques propres à une optimisation doivent être rapportées dans `metrics` et comparées séparément, pour ne pas compter une capacité désactivée comme une erreur sémantique. La condition A de référence a été exécutée sur les 600 cas; le pilote E03 compare AJV au validateur Omega. Ces résultats vérifient le contrat et l'outillage du corpus, pas les autres conditions ni la supériorité de G-CIR Ω. Ce corpus ne permet pas de prétendre à une validation cachée, à une généralisation métier ou à une indépendance tierce.
