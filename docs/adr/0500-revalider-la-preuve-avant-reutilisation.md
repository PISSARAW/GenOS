# ADR 0500 — Revalider la preuve avant réutilisation

- **Statut** : Accepté et implémenté pour la mémoire de requête.
- **Date** : 2026-10-15
- **Domaine** : Intégrité des résultats persistés et réutilisation de cache.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0492, statut de champion ; ADR 0496, reçu lié au résultat ; ADR 0499, invalidation scopée.

## Contexte

Le service vérifiait le reçu à l'insertion et lors d'une promotion directe, mais
`lookupReusable` faisait confiance ensuite au statut `VERIFIED`, à l'expiration
et au snapshot des dépendances. Une modification SQLite du contenu ou des
évidences pouvait donc conserver un reçu devenu faux tout en laissant le
résultat réutilisable.

## Décision

Avant tout hit, `lookupReusable` revalide le reçu persisté et son digest par
rapport au contenu, aux évidences, au snapshot de dépendances, au semantic ID et
au workspace. Une preuve absente ou invalide entraîne un miss et la transition
scopée vers `STALE`.

## Conséquences

### Positives

- Une mutation persistée après promotion ne conserve pas le statut `VERIFIED`
  comme preuve suffisante pour un hit.
- Le test modifie `content_json` après signature et observe un miss ainsi que le
  statut `STALE`.
- Les entrées historiques sans reçu ne sont plus réutilisables par ce parcours.

### Négatives

- Chaque lecture de résultat vérifié fait une validation HMAC et un digest des
  données JSON stockées; le coût augmente avec la taille de l'évidence.
- Les reçus obsolètes demandent une nouvelle vérification avant d'être promus.

## Alternatives

- Vérifier seulement à l'insertion : rejeté, car le stockage peut être altéré
  après promotion.
- Faire confiance au statut `VERIFIED` en base : rejeté, car le statut n'est
  pas lié cryptographiquement au contenu réutilisé.
