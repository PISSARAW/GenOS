# ADR 0478 — Lier l’idempotence HTTP au corps de requête

- **Statut** : Accepté et implémenté
- **Date** : 2026-10-14
- **Domaine** : API HTTP, reçus de réponse et reprise après panne.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0472, séparation des preuves d’exécution et de promotion.

## Contexte

Le middleware HTTP global est opt-in par clé, mais son reçu était écrit après
l’envoi du 2xx et la clé ne liait pas le corps. Une même clé avec une autre
requête pouvait rejouer une ancienne réponse. Les marqueurs sans réponse étaient
supprimés automatiquement après cinq minutes ou une heure, alors que l’effet
métier pouvait déjà avoir eu lieu. Le middleware ne s’applique pas aux appels
fournisseur LLM/MCP internes.

## Décision

Chaque réservation lie atomiquement la clé de portée à l’empreinte canonique du
corps JSON. Un corps différent avec la même clé produit `409
IDEMPOTENCY_KEY_CONFLICT`. Les lignes héritées sans empreinte ne sont pas
rejouées. Une réponse JSON 2xx est envoyée seulement après l’`UPDATE` conditionnel
du reçu SQLite. Si la persistance échoue, le serveur envoie un 503 et conserve
la réservation incertaine. Une réponse non-JSON 2xx est transformée en 503 ;
les réponses d’erreur ou les sorties interrompues conservent aussi la
réservation pour réconciliation. Le middleware ne supprime pas automatiquement
les marqueurs incertains après cinq minutes ni à l’expiration du TTL des
réponses réussies.

La confirmation SQLite suit la configuration WAL/synchronous du backend ; elle
ne promet pas la survie à une panne électrique. L’idempotence des effets
externes exige une clé comprise par le fournisseur ou un reçu par adaptateur.

## Conséquences

- Rejouer la même clé et le même corps retourne la réponse JSON déjà enregistrée
  sans rappeler le handler.
- Rejouer une clé avec un corps différent est refusé.
- Les issues incertaines bloquent une nouvelle exécution automatique. La
  réconciliation ou la suppression contrôlée du reçu nécessite une intervention
  opérateur.
- Les routes opt-in doivent produire une réponse JSON 2xx rejouable.
- Le mécanisme ne garantit ni exactly-once externe ni déduplication LLM/MCP.

## Vérification

`backend/tests/test_idempotency_middleware.js` vérifie la migration de schéma,
l’attente du reçu avant 2xx, le replay sans double effet, le conflit de corps,
le refus des sorties non-JSON et le blocage d’une réservation incertaine après
expiration du délai de vol.
