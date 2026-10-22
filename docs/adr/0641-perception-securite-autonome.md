# ADR 0641 — Perception autonome de la sécurité et modèle de monde

## Statut

Accepté pour l'implémentation initiale.

## Contexte

GenOS possède des mécanismes d'incident et un modèle du monde général, mais pas de chaîne de perception de sécurité dédiée qui conserve les provenances des capteurs, les références de preuve, l'incertitude, les alertes dédupliquées et les relations de sécurité par tenant. Une permission déclarée ne prouve pas qu'un accès s'est produit.

## Décision

Ajouter un service backend ASP tenanté, stocké dans `adaptive_state`, qui relie un registre de capteurs autorisés, un apprentissage de baseline explicitement confirmé comme normal, une détection déterministe et une planification bornée par budget. Les hypothèses produites sont des pistes falsifiables dérivées des observations; aucune décision ne dépend d'un LLM. Les cas sans faits restent `indeterminate` et conduisent à `observe`.

Le modèle du monde conserve chaque relation dans un état `desired`, `observed` ou `measured`. La relation `access-effective` n'est acceptée que comme mesure avec au moins une référence de preuve. Les alertes sont dédupliquées par capteur, sujet, faits et classe. Incidents, faux positifs, causes et chronologies sont conservés dans la mémoire du tenant.

Les écritures utilisent les permissions `security:manage`, la portée d'organisation/projet et les contrôles de membership existants. Les lectures exigent `read` et une portée tenant.

## Conséquences

- Les entrées de capteurs et références restent bornées et séparées des conclusions.
- La baseline ne s'adapte qu'avec `confirmedNormal: true`; son calcul simple par fréquence est un point de départ, pas un profil comportemental mature.
- La calibration est alimentée par des résultats explicitement enregistrés; les seuils de benchmark proposés ne sont pas des résultats observés.
- L'implémentation ne collecte pas directement les journaux, événements AD ou télémétrie hôte. Les connecteurs de capteurs et leur ordonnanceur périodique restent à ajouter.
- La mémoire est partagée par tenant dans le stockage adaptatif; les politiques de rétention et d'accès à granularité fine devront accompagner une ingestion de production à grande échelle.

## Vérification

Les seuils de qualification ASP restent des objectifs de benchmark à mesurer sur un corpus simulé bénin, malveillant, incomplet et inconnu. Aucune prétention de qualification à 100 % n'est faite par cette ADR.
