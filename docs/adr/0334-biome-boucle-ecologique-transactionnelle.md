# ADR 0334 — Biome : boucle écologique transactionnelle et exécution vérifiée

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Biome, écologie, ressources, persistance et preuves
- **Lié à** : [Biome](../02-orchestration/topologies/biome.md), [Runtime Biome](../03-reference/runtime-biome.md)

## Contexte

Les onze contrôleurs étaient accessibles séparément. La boucle multi-ticks conservait un état local divergent, réappliquait certaines actions et tentait de recréer la session lors de sa sauvegarde. Elle assimilait allocation et consommation, puis pouvait conclure une mission après une période sans changement. Les quatre rôles du plan de contrôle formaient artificiellement quatre populations.

## Décision

Chaque cycle observe et versionne l'environnement, découvre des niches justifiées, recrute des individus compatibles, intègre des résultats mesurés, applique une variante, modifie les interactions documentées, réalloue les ressources et régule la capacité. Ces effets forment une seule mutation versionnée. SQLite utilise le store transactionnel existant ; la mémoire utilise une copie de travail et une file par session. Un conflit de révision ou une erreur annule le cycle.

Le budget compte la consommation, les migrations, la récupération et les réservations d'exécution. Une allocation ne consomme pas de budget. Les ressources initiales ne sont créditées qu'une fois par mission ; les soldes inutilisés sont réalloués. Les plafonds environnementaux placent l'excédent en quarantaine comptable. Les résultats portent une identité non rejouable.

Le runtime conserve sa progression, ses limites, son historique et ses reçus. Une reprise continue la même mission. Une nouvelle mission persistante hérite de l'écologie et de sa mémoire, avec un nouveau compteur de budget et sans ancienne preuve de réussite.

Un registre d'adaptateurs configure des opérations concrètes côté serveur. Chaque exécution exige un individu actif, la capacité déclarée, une autorisation strictement vraie et une réservation persistée. Le transport produit une sortie dont l'empreinte SHA-256 est transmise au vérificateur indépendant. La preuve doit correspondre à la session, à l'exécution et à cette empreinte. Un appel déjà réservé ne se réexécute pas après reprise ; une opération interrompue reste indéterminée. Les capacités et autorisations ne peuvent être élargies par une adaptation de phénotype.

La mémoire biofilm et le progrès d'apprentissage influencent les alternatives de foraging. Une construction de niche provient d'un résultat mesuré avec références et modifie l'environnement versionné. La résilience compare une productivité observée avant perturbation à une nouvelle mesure après restauration ; la seule recolonisation ne suffit pas. Une archive conserve les pistes non dominées et les individus retirés par capacité restent récupérables.

La réussite globale exige un vérificateur de confiance lié à la session et au tick. L'entropie, l'inactivité et la présence de références ne valent pas preuve de réussite. Une santé stressée, une couverture fonctionnelle incomplète ou un effondrement global empêchent cette conclusion.

## Conséquences

Les opérations MCP `cycle` et `run` complètent les commandes unitaires. Les mêmes contrats sont utilisés par les missions morphogénétiques et la reprise SQLite. La suite `test:biome` couvre les variantes, la conservation, les conflits, le rollback, les adaptateurs, la mémoire et la perturbation/récupération.

L'hôte fournit les accès aux outils, les observations et les vérificateurs. Aucun credential, worker distant ou résultat scientifique n'est créé par la composition seule. Les améliorations comparatives de performance réclament une campagne à budget égal.

## Alternatives écartées

Une boucle locale non transactionnelle, un succès inféré de la stabilité et une confiance dans le seul statut du fournisseur masqueraient les erreurs et casseraient les gates. Un daemon permanent n'est pas nécessaire : les invocations bornées continuent explicitement une session durable.
