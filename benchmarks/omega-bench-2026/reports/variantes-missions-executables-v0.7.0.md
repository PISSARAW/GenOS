# Variantes de missions exécutables — corpus public v0.7.0

## Provenance et limite de la source

Le texte de proposition fourni donne le détail de M1 seulement. Il indique qu'un explorateur contient six missions, mais ne livre pas les descriptions de M2–M6. Les entrées M2–M6 de `dataset/missions/catalog.json` sont donc conservées comme interprétations synthétiques dérivées des thèmes et expériences qu'elles couvrent. Elles ne sont pas présentées comme les scénarios originaux de la proposition.

## Couverture publique

Les variantes comportent des charges structurées sous `input.mission_workload`. Les adapters exécutent une tâche dédiée et retournent `answer.mission_execution`; les oracles Python construisent indépendamment la sortie attendue. Le scorer exige cette sortie et compte ses violations comme échecs critiques.

| Mission | Cas publics | Expériences | Travail exécuté et contrôlé |
| --- | ---: | --- | --- |
| M1 | 500 | E01, E05, E07 | Mission source exacte existante; inchangée. |
| M2 | 2 000 | E03, E08 | Filtrage de demandes permises/interdites selon principal et politique; E03 pilote aussi son candidat typé. |
| M3 | 300 | E02, E04 | Aller-retour JSON des messages de tâche et vérification de préservation; E04 conserve ses programmes et ses cinq passes. |
| M4 | 250 | E06, E10 | Reprise idempotente de tâches interrompues et continuité des obligations/topologies. |
| M5 | 50 | E11 | Allocation collective sous budget, avec minima, priorités et conservation. |
| M6 | 300 | E09, E12 | Échelle simulée d'agents et transferts d'une intention via représentations JSON, tabulaire et portable. |

Total : 3 400 cas répartis sur 12 expériences, dont 2 900 avec une charge exécutable M2–M6. E04 et E12 restent au même effectif et conservent leurs tâches de base; leurs entrées et oracles incluent la charge de mission correspondante.

## Reproductibilité et portée des relances

Générer avec `python benchmarks/omega-bench-2026/src/generate_dataset.py`. La génération est déterministe (seed `20261027`). Selon la politique LF du manifeste de missions, le SHA-256 normalisé du manifeste public est `4604c2f870044c3b94fcd71ca833dcf561f91ba53f1869ddfc4d63b9ee54ffd2`.

| Expérience | SHA-256 entrées | SHA-256 oracle |
| --- | --- | --- |
| E02 | `6f11542e79c266e1400dc78eee1dd36235ef72415e4f12c0428ee5177e2fef3f` | `e420afc1f644ba9bf3c625db515089f7bde680fad83ad6c948104fe5fa815026` |
| E03 | `1a6f06da2899eff26a5f44097e86b0e4a5bb70363843434f52cb5b61f0ce7b39` | `9ef0c393599126c05af839b2b8becf3b55958939019c96a9eeb7112fd053bf49` |
| E04 | `afe4f9264e0bbc3170e4c29ccedd467c6c8e6852f202a33cb53bf41a7b3163be` | `831b544663d8b4dcc6229994eaa0efe848c822707a0efeaf348ffcabcff21334` |
| E06 | `52b6f92b398e04bdcf149f437ae305dff243e624bf5cd5b52abedde0e221d4a5` | `29d8eb5133ccde2000070e6edb83337414ed6425a70441755cbd13e5ff84fa78` |
| E08 | `b7398b5a1422dd261b0dcd5c27264d0acbcab39129039dc0c9ef1198e13a31ae` | `33653a7fe26697f83e6687025b1e8071b6440e4a109af3349d523f15bb073979` |
| E09 | `777e9e5387a71ac56a71fb42c5045d3ee3759d4933e42dfac3a3d11eac848443` | `879d1d5bb2a4ea29618aabe46a80452014957022ac572f6e5170e2a0ea43e7a4` |
| E10 | `26f8b03ffa67f314ba4af175f59a85c7343936c7d72bbd47f80c9b3ad9ece35e` | `59dad06374610193903d2c361ae1dc20ade961b565be4d1f60885170a394cfbb` |
| E11 | `8d78cfcb5c38afc95e8ea545af8bfd8a36a27d1f65735a9ed51e43419ec678bc` | `f5a560f1139a3f5356ca54fed3fdb130b5ebce1c47540acbae10f3c50ba53c1a` |
| E12 | `84931cf97d71fed12e4caddb33575ddedcc0de67f7e2b7d27afe369730e487f0` | `a3531637af07df6a025d2c10cf6eefb6529dfc7b8d36e560604abbde84131698` |

Le hash brut du fichier manifeste est `830dd926a8bb4ecf6749f62bd26165a6efacd263004d95df8499b563bbad4134`; le hash normalisé ci-dessus suit la règle LF déclarée.

Les fichiers d'entrée/oracle des expériences E02, E03, E04, E06, E08, E09, E10, E11 et E12 ont changé. Le manifeste global a changé aussi; tous les résultats qui le référencent sont donc périmés, y compris ceux d'E01, E05 et E07. Les familles A–D, baselines, A1–A8, E09, rapports statistiques et traces doivent être régénérées avant analyse. Aucun holdout, protocole JSON, oracle privé ou résultat de campagne complète n'a été lu ou modifié ici.

Vérifications ciblées effectuées : génération deux fois avec tous les fichiers dataset identiques; comparaison exécuteur/oracle des sorties mission sur 2 900 cas; exécution ponctuelle de l'adapter C sur un cas de chacune des neuf expériences touchées; E09 charge limitée à 10 agents × 1 répétition, avec 10/10 agents corrects. Syntaxe Node et compilation Python des fichiers modifiés réussies. Aucun gate du dépôt ni campagne complète n'a été lancé. Cette mise à jour ne confirme aucun seuil de la proposition et ne constitue pas une campagne confirmatoire.
