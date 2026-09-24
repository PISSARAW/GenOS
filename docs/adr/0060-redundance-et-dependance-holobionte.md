# ADR 0060 — Redondance fonctionnelle et contrôle de dépendance Holobionte

## Statut

Accepté — onzième lot du plan Holobionte.

## Contexte

Une capacité portée par un seul symbionte peut devenir un point de défaillance,
même si ce symbionte est petit ou peu sollicité. Le Host doit connaître ses
niches, ses substituts et ses dépendances réelles.

## Décision

1. Construire les niches à partir des capacités essentielles de la constitution,
   du phénotype du Host et des capacités des contrats actifs des résidents.
2. Exposer le nombre de fournisseurs, un fournisseur primaire et les backups
   disponibles par capacité.
3. Marquer comme keystone le symbionte qui est l'unique fournisseur externe
   d'une capacité essentielle non couverte par le Host.
4. Comparer les scores de dépendance observés aux plafonds du contrat et de la
   constitution. Refuser le budget au-delà de la borne la plus stricte et
   recommander un backup, l'extraction d'une procédure ou le recrutement.
5. Exiger des références de preuve pour chaque observation de dépendance.

## Conséquences

- Les pertes de couverture et les points uniques sont visibles avant une
  substitution ou une réallocation.
- Le primaire est déterminé de manière stable par le plafond de dépendance ;
  l'apprentissage fondé sur l'historique des bénéfices viendra plus tard.
- Les observations de dépendance sont fournies par le ledger longitudinal ;
  ce service les contrôle sans inventer de métrique absente.

## Alternatives

- Utiliser seulement le nombre total de résidents : rejeté, car il ne révèle pas
  les capacités sans substitut.
- Assimiler le plafond déclaré dans un contrat à la dépendance observée :
  rejeté, car un plafond n'est pas une mesure d'usage réel.
