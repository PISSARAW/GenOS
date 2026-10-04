# ADR 0284 — Routage priorisé des missions Holobionte

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Holobionte, sélection de variants, missions
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0277, ADR 0283

## Contexte

Les expressions génériques `edge`, `local` et `cloud` apparaissaient dans plusieurs
règles d'intention. La première correspondance pouvait ainsi choisir `local-first`
pour une mission cloud/edge, ou `edge-core/cloud` pour une demande simplement locale.
Le reçu ne conservait pas l'ensemble des règles qui avaient correspondu.

## Décision

Prioriser les expressions de sécurité, synchronisation, cloud-core/edge et
edge-core/cloud avant les exigences locales génériques. Les termes de déploiement
exigent maintenant des formulations plus précises. Le reçu de sélection inclut toutes
les intentions concordantes; si le variant spécialisé prioritaire est incompatible,
le fallback conserve les variants rejetés et leurs prérequis manquants.

## Conséquences

### Positives

- Les termes isolés `edge`, `local`, `cloud` et `remote` ne déclenchent plus un
  placement architectural spécialisé.
- Les règles rencontrées et les incompatibilités sont observables dans le reçu.
- Les formulations couvrant plusieurs dimensions ont un ordre de priorité stable.

### Limites

- Le routage reste une heuristique lexicale; les intentions réellement ambiguës
  doivent préciser leur variant avec `variantId` ou `variant`.
- Le corpus de missions de sécurité existant a été relu statiquement; la suite n'a
  pas été exécutée dans ce changement.

## Corpus de contrôle

| Formulation représentative | Variant attendu |
| --- | --- |
| authentification, secrets, vulnérabilité, invariants de rollback | `immune-critical` |
| synchroniser l'état Edge avec horloges causales | `cloud-core/edge-sync` |
| cœur cloud avec symbiontes Edge | `cloud-core/edge-symbionts` |
| cœur local/Edge avec capacité cloud à la demande | `edge-core/cloud-symbionts` |
| traitement hors ligne ou sur appareil | `local-first` |

## Alternatives

- Garder la première expression générique gagnante : rejeté, car elle masquait les
  spécialisations concurrentes.
- Inférer librement les besoins depuis un seul mot `edge` : rejeté, car il ne permet
  pas de distinguer cœur cloud et cœur local.
