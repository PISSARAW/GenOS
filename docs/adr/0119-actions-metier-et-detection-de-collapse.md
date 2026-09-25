# ADR 0119 — Actions métier et détection de collapse

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Runtime worker, supervision, observabilité
- **Décideurs** : GenOS
- **Lié à** : [ADR 0064](0064-registre-workerkind-node-et-dispatch.md), [ADR 0116](0116-execution-fiable-communication.md)

## Contexte

Les essais de workers ont montré que des événements produits par le contrôle de
recherche, la supervision et les journaux runtime entraient dans la fenêtre
d'entropie comme s'il s'agissait d'actions du worker. Une entropie de transition
nulle sur trois signatures ou moins suffisait aussi à déclencher un arrêt, même
lorsque l'entropie des actions observées restait élevée. Natural Search recevait
par ailleurs des événements de cycle de vie et de diagnostic sans rapport avec
la progression du worker.

## Décision

Les métriques du Swarm Sentinel portent sur des actions observables du worker,
pas sur les événements internes du runtime. Les sorties du Sentinel, de Natural
Search, de la supervision, des journaux runtime et des mécanismes de conscience
sont ignorées. Une signature d'action absente ou générique n'est pas ajoutée à
la fenêtre.

Natural Search ne traite que les événements métier explicitement autorisés :
étapes de l'agent hors marqueurs `THINK` et `VERIFY`, messages, résultats d'outils,
rapports d'évidence et échecs de mission. Les marqueurs `item.started`,
`turn.started` et `turn.completed` ne comptent pas comme progrès. Ses propres
événements restent exclus.

Un collapse est retenu si une action domine au moins 85 % d'une fenêtre minimale
de quatre observations, si l'entropie normalisée est inférieure à 0,20 sur cette
même taille minimale, ou si une séquence périodique exacte est confirmée sur au
moins deux périodes (quatre observations pour une action unique). Une entropie
de transition nulle à elle seule ne prouve pas un deadlock.

Chaque intervention expose son code de cause, la taille de l'échantillon, le
nombre d'actions distinctes, le ratio de dominance, l'entropie de transition et
la longueur du cycle détecté.

Le choix d'une stratégie de repli est conservé comme métadonnée structurée du
contrat (`primaryFallback`). Le sélecteur n'écrit pas ce diagnostic sur stderr :
un journal runtime ne doit pas devenir une nouvelle entrée de mission.

## Conséquences

### Positives

- Les journaux et événements internes ne provoquent plus de faux arrêts.
- Les arrêts du Sentinel reposent sur des séquences d'actions observées et
  répétées, et leur cause est disponible dans la télémétrie.
- Natural Search ne s'auto-alimente plus à partir des événements de supervision.
- Le diagnostic de repli reste consultable dans le contrat sans générer un
  événement runtime susceptible de réentrer dans les superviseurs.

### Négatives

- Les événements runtime non listés comme métier n'influencent pas Natural
  Search jusqu'à leur ajout explicite au contrat.
- Le cycle le plus long détectable dépend de la taille de fenêtre du Sentinel.
- Le filtrage n'élimine pas les faux positifs causés par une vraie séquence
  métier répétée mais légitime; les seuils restent à calibrer sur des missions
  spécialisées.

## Alternatives

- Désactiver le Sentinel pour les missions workers : rejeté, car cela supprimerait
  la protection contre les boucles réelles.
- Garder tous les événements et ne modifier que le seuil d'entropie : rejeté,
  car la télémétrie interne continuerait à contaminer les mesures.
