# ADR 0746 — Rappel mémoire borné pour le raccord FP-AMB

- **Statut** : Accepté — campagne exécutée, amélioration à confirmer
- **Date** : 2026-10-26
- **Domaine** : Mémoire vectorielle, GraphRAG, intégration de benchmark
- **Décideurs** : GenOS
- **Lié à** : [ADR 0733](0733-rappel-memoire-situationnel-inspire-tsao.md)

## Contexte

Le raccord FP-AMB doit mesurer le comportement de la pile de mémoire GenOS sans
fournisseur de démonstration à réponses codées en dur. L'envoi de tous les
résultats classés au modèle produit un contexte trop volumineux. Une limite
naïve au seul top-K principal réduit également le rappel de souvenirs utiles
accessibles par le graphe ou la proximité temporelle. Les expériences doivent
exclure les souvenirs d'exemple intégrés au backend, sans changer le défaut des
autres consommateurs de `VectorMemoryService`.

## Décision

Ajouter dans la réponse de `VectorMemoryService.searchMemory` un champ
`retrievedMemories` qui contient les résultats principaux retenus et un
complément borné issu des associations déjà calculées : au plus deux
associations de graphe, deux voisines temporelles et une voisine vectorielle,
avec déduplication par identifiant. Conserver `allScoredExperiences` pour la
compatibilité des consommateurs existants et les diagnostics; l'adaptateur
FP-AMB injecte uniquement `retrievedMemories`.

La sélection du contexte est réglable par `GENOS_FPAMB_TOP_K` (1–20, défaut
15). Le raccord demande explicitement `includeSeedExperiences: false`; sans
cette option, les consommateurs conservent le comportement antérieur. Il
refuse le repli d'embedding non sémantique et vérifie les liens STDP par
GraphRAG. Le runner vérifie les budgets, appels, compteurs et traces avant
d'écrire le manifeste.

Le réglage `topK=15` est retenu comme valeur par défaut expérimentale parce qu'il
a donné les deux meilleurs résultats observés de cette séquence (52,5 % puis
54,4 %); ce choix n'est pas une garantie de score supérieur sur tout modèle ou
toute machine.

## Conséquences

### Positives

- Le contexte adressé au modèle est explicite, dédupliqué et borné à `topK + 5`.
- FP-AMB ne peut pas obtenir une réponse depuis les souvenirs d'exemple du
  backend.
- Les preuves de génération, de rappel, de graphe et de modèle sont liées dans
  un manifeste vérifiable.
- La réponse mémoire enrichie est additive et préserve le champ historique de
  candidats classés.

### Négatives

- Le complément du graphe est sélectionné selon les annotations déjà émises par
  GraphRAG; la limite de cardinalité ne garantit pas la pertinence de chaque
  élément.
- `topK=15` n'a pas encore de validation statistique ni de confirmation sur une
  matrice de modèles et de machines.
- Le raccord évalue les services mémoire et `modelRouter`, pas
  `genos_orchestrate` ni l'exécution de workers.

## Alternatives

- Injecter tous les candidats classés : écarté, car le contexte moyen de la
  baseline était d'environ 9 654 tokens.
- N'injecter que le top-K vectoriel : écarté après la hausse des omissions de
  rappel observée avec un contexte trop strictement tronqué.
- Utiliser le provider FP-AMB de démonstration : écarté, car il contient des
  réponses codées en dur et ne mesure pas le runtime GenOS.
- Faire exécuter le benchmark par `genos_orchestrate` : hors décision; le
  harnais actuel n'est pas un adaptateur de mission orchestrée.
