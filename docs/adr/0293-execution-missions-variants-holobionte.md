# ADR 0293 — Exécution persistante des missions par variant Holobionte

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Holobionte, Morphogenèse, exécution de missions
- **Lié à** : ADR 0129, ADR 0284

## Contexte

Les policies de variants et leurs opérations étaient testables isolément, mais le
runtime Morphogenèse n'installait pas les plugins par défaut. Le variant sélectionné
par le plan n'était pas transmis comme entrée d'exécution et aucun chemin ne reliait
une mission à une sélection persistée, un workflow d'opérations, un Host longitudinal
et un verdict indépendant. Le chemin générique rendait toujours une issue
`unverified` sans exploiter un verdict vérifié déjà produit.

## Décision

- Un `MorphologyRuntime` installe les plugins de topologie par défaut; une option
  explicite permet de désactiver cette installation pour les tests isolés.
- L'exécuteur transmet topologie, variant, mission et workers au plugin. Les missions
  Holobionte peuvent fournir une séquence `variantOperations` et l'exécuter via le
  contrôleur persistant et son journal append-only.
- Une mission longitudinale ouvre ou réutilise le Host persistant par `hostId` et
  conserve les liens de mission. Le changement de variant sur ce Host garde son
  contrôle d'approbation.
- Les budgets sont normalisés par `budgetCoherenceService`. Les callbacks reçoivent
  un `AbortSignal`; le workflow s'arrête à l'échéance ou au dépassement observé.
- Une opération n'est pas un succès métier. Le verdict `PASS` exige une fonction de
  vérification exécutée, deux identifiants de vérificateurs distincts et des assertions
  `PASS` qui référencent des preuves. Sans ces éléments, la mission reste
  `INCONCLUSIVE` ou bloquée.
- Les événements de campagne sont émis par `telemetryObserver`; les références et le
  contenu des preuves restent fournis et vérifiés par les adaptateurs de mission.

## Conséquences

Les opérations pures et les callbacks réels partagent un chemin persistant et borné.
Les missions qui exigent des fournisseurs, outils, leases ou vérificateurs doivent
continuer à fournir des adaptateurs et preuves authentiques; le runtime échoue fermé
quand ils manquent. Cette ADR ne prétend pas qu'un plan de placement déclenche un
fournisseur cloud ou qu'une référence de preuve valide son contenu.
