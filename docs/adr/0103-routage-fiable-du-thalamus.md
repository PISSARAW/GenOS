# ADR 0103 — Routage fiable du thalamus

## Statut

Accepté.

## Date

2026-09-25

## Domaine

API LLM, routage, cache, filtrage d'outils et capacité de service.

## Lié à

ADR 0036 — Harness remplaçable, registre et routage par capacités ; ADR 0019 — Socle épistémique du savoir.

## Contexte

Le relais du thalamus renvoyait des erreurs comme des complétions valides, ignorait l'historique conversationnel, confondait des modèles entre fournisseurs et consultait son cache avant de charger la configuration. Le garde-fou d'outils prenait des décisions lexicales sensibles aux négations et choisissait un repli dépendant de l'ordre du catalogue. L'API exécutait un thread sans limite par connexion et son limiteur n'était pas rechargé automatiquement.

## Décision

- Représenter les messages et les erreurs LLM par des structures explicites et préserver les rôles dans les requêtes envoyées aux fournisseurs.
- Charger la configuration avant tout routage, sélectionner les variables de modèle propres à chaque fournisseur et rejeter les fournisseurs inconnus.
- Traiter les échecs fournisseurs comme des erreurs HTTP, et rejeter explicitement le streaming non pris en charge.
- Activer le cache uniquement avec `GENOS_THALAMUS_CACHE`; hacher les clés, distinguer le tenant, le fournisseur, le modèle et les paramètres de génération, borner le nombre d'entrées et écrire par remplacement temporaire.
- Faire du niveau de raisonnement complexe une consigne de vérification transmise au modèle, déclenchée aussi par le score de complexité, au lieu d'interrompre la réponse avec une alerte.
- Rendre les replis d'outils déterministes et refuser les actions explicitement niées.
- Borner les connexions en traitement et recharger automatiquement les jetons du limiteur.

## Conséquences

### Positives

- Les clients peuvent distinguer une complétion d'un échec et les fournisseurs reçoivent le contexte conversationnel.
- Le cache est désactivé par défaut et ne révèle pas le prompt dans sa clé.
- La sélection d'outils ne dépend plus de l'ordre du catalogue pour son repli.
- Les ressources de l'API sont limitées par une file bornée et un nombre fixe de workers.

### Négatives

- Le cache est désactivé tant que l'opérateur ne choisit pas explicitement son chemin ; les réponses en cache restent stockées en clair à cet emplacement.
- Le niveau complexe reste une instruction envoyée au même fournisseur, pas une preuve de raisonnement correct ni une exécution orchestrée.
- Le filtre d'outils reste lexical et doit rester complémentaire des leases et de la validation d'exécution.
- Le serveur ne prend toujours pas en charge le streaming et le signale par une erreur de requête.

## Alternatives

- Laisser le cache toujours actif dans le workspace : écarté car cela écrit silencieusement prompts et réponses en clair.
- Traiter le filtre lexical comme une frontière d'autorisation : écarté car la sélection d'outils n'établit pas à elle seule l'autorité d'exécution.
- Introduire un runtime asynchrone complet et une inférence de capacités par modèle : reporté, au-delà du correctif de fiabilité du relais existant.
