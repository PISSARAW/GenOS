# ADR 0795 — Benchmark Deceptive-Patch par ablation de composants

- **Date** : 2026-11-04
- **Statut** : accepté pour préparation du pilote ; aucun résultat modèle acquis
- **Domaine** : benchmarks, provenance, GQWF

## Contexte

Le protocole DPB-1 fourni propose trois tâches trompeuses et trois bras pour
distinguer clôture libre, validation et exploration isolée. Le harnais historique
cité n'est pas présent dans le checkout. Le validateur `workerArtifactCodeProof`
atteste une liaison de provenance ; il ne démontre ni la couverture d'un invariant
ni la correction fonctionnelle complète. Les pourcentages proposés sont spéculatifs.

## Décision

Créer `benchmarks/deceptive-patch-bench/` sans modifier le runtime de production.
Réutiliser l'import CAS GQWF et son matérialiseur portable pour figer, isoler et
rejouer les artefacts, et le validateur CodeProof réel pour les reçus observés.
Compléter cette provenance par des tests publics immuables. Garder huit contrôles
réservés par tâche exclusivement pour l'évaluation après sélection.

Les trois bras partagent modèle, instructions, interface JSON et plafond total de
douze appels. Le bras isolé répartit ces appels entre trois candidats ; les appels
ne sont pas multipliés par trois. Conserver aussi les soumissions rejetées et
séparer déclaration brute erronée et clôture incorrecte acceptée.

Figer les sources, versions et paramètres avant chaque campagne ; journaliser les
requêtes, réponses et compteurs natifs. Refuser le score en cas de manque de preuve.
Les contrôles scriptés qualifient le harnais sans mesurer la qualité d'un LLM.

Un contrôle positif supplémentaire a révélé que le marqueur de fin synchrone
précédait le résumé asynchrone de `node:test`. La version `components-v2` émet
ce marqueur à `beforeExit` et autorise le reporteur TAP à écrire ensuite.
Le statut natif est conservé et un `process.exit(0)` prématuré reste refusé.
La campagne v1 interrompue est conservée comme
calibration non qualifiée ; la campagne v2 reprend les 90 essais depuis zéro,
avec les mêmes tâches, seeds, budgets et instructions.

## Conséquences

Le pilote est exécutable sans dépendance supplémentaire sur Node 24+, avec Ollama
ou un endpoint compatible explicitement configuré. Il mesure une ablation de
composants, pas l'orchestrateur complet, GQEL ou l'allostasie. Le traitement C
combine redémarrage du contexte, isolation et sélection : il n'isole pas chacun
de ces effets. Les tests publics peuvent accepter une régression cachée ; le taux
de corruption n'est jamais fixé à zéro par définition.

Les répétitions portent sur trois tâches construites par le même expérimentateur.
Les contrastes sont descriptifs et ne suffisent pas à prouver une supériorité
générale. L'API de permissions Node réduit les capacités ; elle ne remplace pas
un sandbox OS pour du code hostile à l'oracle.

## Alternatives

- Employer les oracles cachés pendant la sélection : rejeté, car fuite de vérité.
- Simuler GQEL et nommer ce résultat « GenOS complet » : rejeté, portée trompeuse.
- Intégrer immédiatement l'orchestrateur entier : différé jusqu'à qualification
  de l'instrumentation commune et définition d'un quatrième bras de redémarrage.
- Présélectionner des taux attendus : rejeté ; conserver tous les échecs et coûts.
