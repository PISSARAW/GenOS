# ADR 0634 — Qualifier les matérialiseurs GQWF par paires

- **Statut** : Accepté, protocole local non promoteur
- **Date** : 2026-10-18
- **Portée** : GQWF, matérialisation, OverlayFS, reflink, benchmark, preuves

## Contexte

GQWF dispose de trois mécanismes physiques : copie portable, reflink natif et
OverlayFS Linux. La politique explicite `auto` choisit actuellement le premier
backend disponible dans un ordre fixe. Cette sonde prouve une capacité locale,
mais elle ne mesure ni le coût complet de matérialisation, ni la capture, ni la
libération. Elle ne prouve pas non plus que deux backends produisent la même
racine après une mutation identique.

Déduire un ordre universel depuis la nature d'un backend reproduirait une
faiblesse que GQWF cherche précisément à éviter : confondre disponibilité,
performance et validité sémantique. Les résultats dépendent du filesystem, du
noyau, du cache, de la taille des fichiers et de la charge de la machine.

## Décision

Ajouter le protocole `gqwf-materializer-paired-v1` sous
`benchmarks/gqwf-materializers/`.

Pour chaque accélérateur demandé et disponible, le protocole :

1. crée deux fixtures fraîches contenant les mêmes octets ;
2. exécute un bras accélérateur et un bras `portable-copy-v1` ;
3. alterne leur ordre à chaque répétition ;
4. mesure matérialisation, mutation, capture et libération ;
5. exige au moins trois répétitions ;
6. compare la racine initiale, la racine candidate et le nombre de fichiers ;
7. rapporte séparément les backends indisponibles et leur cause.

Les mesures portent la révision Git, l'état propre ou sale du checkout et les
caractéristiques principales de l'environnement. Les échantillons bruts sont
conservés avec des résumés p50 et p95 ainsi qu'un ratio portable/accélérateur.

Le rapport fixe toujours :

- `performanceClaim: none` ;
- `runtimePromotionAuthorized: false` ;
- `autoPolicyChanged: false`.

Un écart de racine est un échec sémantique, pas un résultat de performance. Un
backend indisponible n'est ni gagnant, ni perdant : il est `skipped`.

## Conséquences

- Les accélérateurs peuvent être comparés sur la machine réellement visée.
- La parité sémantique est vérifiée avant toute lecture des ratios de temps.
- Les résultats restent reproductibles et auditables au niveau de la révision.
- Le protocole ne modifie aucune tête, politique de mission ou décision `auto`.
- Chaque bras froid reconstruit ses caches ; un futur protocole distinct devra
  qualifier explicitement les régimes chauds et les charges concurrentes.
- Trois répétitions limitent les conclusions les plus fragiles mais ne
  suffisent pas à établir une supériorité générale.

## Alternatives écartées

- Modifier `auto` après une seule exécution locale : rejeté, car une mesure
  locale n'est pas une preuve de portabilité ni de stabilité.
- Comparer uniquement la création du dossier : rejeté, car la capture et la
  libération font partie du coût et de la sûreté du cycle de vie.
- Utiliser seulement des mocks : rejeté pour le runner ; les mocks restent
  utiles au test du protocole, tandis que le CLI appelle les vrais backends.
- Réutiliser la même fixture entre les bras : rejeté, car le cache construit
  par le premier bras contaminerait systématiquement le second.
