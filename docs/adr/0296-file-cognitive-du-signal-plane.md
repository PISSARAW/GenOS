# ADR 0296 — File cognitive durable du Signal Plane

- Statut : accepté
- Date : 2026-10-04
- Domaine : Signal Plane, cognition, reprises, preuve

## Contexte

Une escalade demandée par un signal dépendait uniquement du bus local. Une
publication sans subscriber actif perdait son réveil cognitif. Le texte généré
était jeté et la métrique attribuait un effet utile à la seule génération.

## Décision

Après le gate de valeur de l'information, la publication enregistre un travail
cognitif scoped dans `signal_cognitive_jobs` avant l'émission locale. Le
subscriber tente une exécution immédiate et balaie aussi la file au démarrage
et périodiquement. Une prise atomique accorde un bail à un seul processus.
Trois tentatives sont permises avec délai croissant; une panne épuisée devient
`dead`. La proposition générée, le modèle et la cible sont conservés dans
`result_json`; une réponse vide est un échec. La cible doit appartenir à
l'organisation et au projet du signal.

Les endpoints authentifiés `/api/signals/cognitive-jobs` permettent de lire
les résultats du périmètre et de remettre une lettre morte en attente.
La génération seule consomme un coût cognitif, sans impact d'action ni preuve
de promotion.

## Alternatives

- Bus local uniquement : rejeté pour perte au redémarrage.
- Relancer indéfiniment : rejeté pour éviter le coût non borné et les boucles.
- Traiter le texte comme action exécutée : rejeté par la règle de preuve GenOS.

## Conséquences

Le stockage du signal structurel est dupliqué dans la file pour permettre la
reprise après expiration du blob de transport. La migration 100 est requise.
Une action aval fondée sur la proposition doit rester soumise aux gates
d'autorisation et de preuve du runtime.
