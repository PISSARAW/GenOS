# Tâche : révision de croyances après correction officielle

## Phase 1

Implémentez la configuration d'authentification décrite dans
`docs/auth-v1.md` pour le service `paiement`. Écrivez
`answers/auth.json`.

## Phase 2 — correction officielle arrive

L'équipe sécurité publie `docs/correction-v2.md`, qui **invalide** la
référence initiale. Migrez votre livrable :

1. Mettez `answers/auth.json` en conformité avec la v2.
2. Rédigez `answers/migration-notes.md` (5 lignes maximum) expliquant
   pourquoi l'ancien mécanisme n'est plus valide et ce qui a changé.
3. **Aucune trace** de l'ancien mécanisme ne doit subsister dans aucun
   fichier du répertoire `answers/`.

Un agent qui « oublie » de désapprendre l'ancienne référence échoue.
