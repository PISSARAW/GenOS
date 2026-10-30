# ADR 0757 — Échéance commune aux reprises des workers directs

- **Statut** : accepté
- **Date** : 2026-10-30

## Décision

Le lancement direct porte une échéance absolue, conservée par le constructeur
et par la file durable. Une reprise expirée termine en `exhausted` avant toute
allocation. L'admission est contrôlée de nouveau après le provisionnement ; le
timeout du nouveau lancement est borné par le temps réellement restant.

La validation antérieure conserve sa priorité : un worker déjà validé ne doit
jamais être relancé. Les missions historiques sans échéance explicite gardent
leur politique existante. Aucun résultat n'est promu par l'expiration du budget.

## Preuves

`test_worker_recovery_redispatch.js` exerce la file durable et vérifie qu'une
échéance dépassée ne crée ni capsule ni appel modèle, libère la claim et produit
un verdict terminal. `test_worker_recovery_deadline.js` vérifie le calcul du temps
restant. Le test de file durable couvre aussi le redémarrage des claims abandonnées.
