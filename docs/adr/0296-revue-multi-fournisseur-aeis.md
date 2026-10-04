# ADR 0296 — Revue AEIS par fournisseurs indépendants

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : AEIS, fournisseurs, processus, promotion
- **Lié à** : ADR 0233, ADR 0294

## Contexte

La revue multi-fournisseur était exécutée seulement à titre informatif. Deux textes non
vides suffisaient au statut `complete`, même en cas de contradiction. Le processus enfant
ne recevait pas les clés nécessaires ou rechargeait le fichier `.env` entier, et son état
était perdu à la fin du processus.

## Décision

Le contrat de stratégie doit activer `multi_provider_verification` et fournir
`aeis_provider_allowlist` avec au moins deux fournisseurs distincts déjà activés dans
`provider_configs`. Chaque fournisseur exécute une revue dans son propre processus avec
uniquement sa clé API, un délai, un plafond de tokens et un plafond mémoire. Le worker ne
lit pas `.env`. La sortie JSON doit référencer le claim et le digest de preuve exacts et
porter un verdict contrôlé. Les revues sont persistées sous la portée et le run, avec
digest de réponse et provenance processuelle. Un quorum absent, une sortie invalide, un
désaccord ou un verdict autre que `supports` impose un veto du Host lorsque la revue est
requise. Le consensus ne crée jamais de reçu de preuve formelle.

## Conséquences

- Positives : les échecs et désaccords sont visibles et influencent effectivement la
  promotion ; les secrets d'un autre fournisseur ne sont pas injectés dans le worker.
- Négatives : sans configuration de deux fournisseurs et leurs accès réseau, la promotion
  avec cette option est refusée. Un consensus de modèles reste consultatif sur la vérité
  du claim ; les vérificateurs exécutables restent nécessaires.

## Alternatives

Traiter deux réponses textuelles comme deux preuves aurait fabriqué une indépendance
épistémique. Hériter de tout l'environnement parent aurait exposé les autres secrets.
