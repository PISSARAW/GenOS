# ADR 0326 — Catalogue nosologique et preuve d'application

**Statut** : Accepté
**Date** : 2026-10-06
**Domaine** : Nosologie, clinique computationnelle et preuves
**Décideurs** : Équipe GenOS

## Contexte

Les neuf familles décrivent 28 analogies de conditions et des traitements dont 19 identifiants manquaient au runtime. Les anciennes issues confondaient parfois journalisation, absence de cible et administration effective.

## Décision

Le catalogue versionné `shared/nosology.json` définit les conditions, leurs marqueurs normalisés, les opérateurs, les gardes et les effets secondaires simulés. L'enum cellulaire et l'enum thérapeutique portent les identifiants sérialisables. Un diagnostic est établi seulement sur une valeur finie dans [0,1] strictement supérieure à 0,5. Les recommandations sont des propositions, jamais une autorisation.

L'application distingue `applied`, `no_target` et `refused`; une issue historique sans statut est `unspecified`. Elle rapporte les différences avant/après. Une rémission exige toutes les mesures de la condition, valides et sous le seuil, et au moins une cible modifiée par l'action. Une mesure absente ou invalide ne permet pas d'effacer un diagnostic. L'apoptose reste une barrière.

Les traitements sont des abstractions de marqueurs GenOS. Les paramètres médicaux illustratifs des fiches ne sont pas des doses ni des protocoles humains implémentés. Les effets secondaires n'affectent que des marqueurs de risque explicitement présents et valides.

## Conséquences

Les traitements historiques restent disponibles; une purge ne peut plus supprimer un pathogène différent de celui demandé. Les mutations persistantes conservent les autorisations signées, le confinement des fichiers, les preuves de population et l'idempotence. Les tests vérifient toutes les entrées du catalogue, les bornes, les absences de cible, les gardes, la sérialisation et les neuf familles.

## Alternatives

- Conserver les identifiants documentaires sans contrat exécutable : couverture invérifiable.
- Réparer directement tous les sous-systèmes évoqués dans les analogies : ces opérations dépassent le contrat de marqueurs et exigent des preuves et autorisations spécifiques.

Le catalogue borné rend les effets testables sans présenter les propositions biologiques comme des mécanismes physiques attestés.
