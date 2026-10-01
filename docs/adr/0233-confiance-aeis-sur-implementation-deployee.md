# ADR 0233 — Confiance AEIS sur l’implémentation déployée

## Décision

Le registre des vérificateurs lie chaque digest à un manifeste SHA-256 du code des adaptateurs, du pont runtime, de la signature, de la politique d’indépendance et du sandbox, ainsi qu’à la version Node. Un type, une version ou un digest inconnu est refusé. Le déploiement local reste la racine de confiance : ce manifeste n’est pas une certification externe du code.

Chaque reçu issu d’une commande porte une preuve d’exécution signée comprenant un UUID généré par le sandbox, le PID observé, la commande, sa sortie et son résultat. L’indépendance demeure celle de la politique existante ; des processus distincts ne prouvent pas à eux seuls une diversité méthodologique.

Le chemin de promotion conserve en SQLite l’assemblée et son manifeste historique, protégés par HMAC. Un autre processus peut les relire et vérifier les signatures sans confondre le code actuel et le code historique. La rétention et la rotation des clés restent à organiser avant déploiement durable.

## Validation reproductible

`node backend/tests/test_aeis_production_adapters.js` exécute deux fois la vraie suite `npm test` du dépôt à travers les adaptateurs de production, vérifie les reçus et leur preuve d’exécution, ferme SQLite puis lance un nouveau processus qui relit l’assemblée et refuse une altération.

Les jugements de fournisseurs LLM restent consultatifs. Ce test valide les fournisseurs exécutables de production ; il ne démontre pas une indépendance entre modèles distants.
