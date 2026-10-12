# ADR 0428 — Journal des tentatives modèle

- Statut : accepté pour le périmètre du routeur modèle Node.
- Date : 2026-10-11.

## Contexte

`usage_ledger` enregistrait seulement les réponses terminées avant le contrôle du
budget réel. Une tentative échouée, interrompue ou rejetée après consommation
pouvait donc manquer du compte. Le champ non nul `quantity` de ce registre ne
permet pas de distinguer une consommation inconnue d'une consommation nulle.

## Décision

Ajouter `model_attempt_ledger` avec une ligne par tentative, créée avant le
précontrôle et terminée une seule fois par identifiant. Le journal distingue
`provider`, `estimate`, `unknown` et `not_called`. Les compteurs et le coût
restent `NULL` lorsqu'ils sont inconnus. Les réponses refusées par le budget
réel, les erreurs et les délais sont conservés. Un fournisseur qui ignore
l'annulation est borné par une course avec l'échéance du routeur.

Conserver `usage_ledger` pour les tentatives dont les compteurs sont connus.
Son identifiant dérive de celui de la tentative et son insertion est
idempotente. Son format historique reste lisible, avec un statut supplémentaire
dans les métadonnées. L'identifiant d'action groupe les essais d'une même
route. Les colonnes `mission_id` et `budget_reservation_id` préparent les
liaisons futures sans créer de réservation implicite.

## Limites

Le routeur appelant ne transmet pas encore systématiquement un identifiant de
mission ; `mission_id` reste alors nul. Une erreur fournisseur sans reçu de
consommation laisse des tokens et un coût inconnus, jamais zéro. Le journal ne
couvre pas encore les outils, les vérificateurs ni les enfants. La réservation
atomique de budget relève du chantier dédié. Un registre disponible ne prouve
pas à lui seul l'exactitude de ses compteurs estimés.

## Vérification

`backend/tests/test_model_attempt_accounting.js` couvre la réponse mesurée,
l'erreur sans compteurs, le rejet après dépassement, le délai et la
finalisation idempotente. Le contrôle qualité et les suites existantes doivent
continuer à être exécutés avant promotion.
