# Qualification locale de l'économie de contexte

Cette qualification porte sur la tranche décrite dans
[ADR 0383](../../docs/adr/0383-economie-tokens-conditionnee-aux-preuves.md).
Exécuter `node benchmarks/token-economy/qualify.cjs` depuis la racine.
Le script génère trois rapports fixes, vérifie le décodage exact et compare le
JSON source au contexte compilé. L'estimateur est `ceil(octets UTF-8 / 4)` ;
ce n'est ni le tokenizer d'un modèle ni un reçu de facturation.

| Fixture | Encodage | Source | Compilé | Écart estimé |
| --- | --- | ---: | ---: | ---: |
| 80 affirmations homogènes | tabulaire | 4 302 | 3 675 | −627 tokens (−14,6 %) |
| 2 affirmations hétérogènes | JSON | 29 | 29 | 0 |
| 1 affirmation | JSON | 14 | 14 | 0 |

Les chiffres concernent uniquement la charge du rapport. Le prompt ajoute
un cadrage, l'empreinte et, pour le format tabulaire, une instruction de lecture.
Dans la fixture longue, la coupe historique à 8 000 caractères omettait la
contradiction finale. La compilation conserve cette contradiction, sa référence
et toutes les autres données ; l'empreinte du JSON reconstitué est identique.

Les tests `test_verified_token_economy.js` et `test_organ_ablation_bench.js`
contrôlent aussi la priorité des échecs en mémoire, la provenance des compteurs
de flux et le refus d'apprendre à partir d'un succès de transport. Cette
qualification ne démontre pas un gain sur les tokens totaux d'une mission, son
coût, sa latence ou sa qualité : ces résultats exigent des runs appariés avec
le même modèle, des reçus réels et un verdict indépendant selon
[le protocole commun](../README.md).
