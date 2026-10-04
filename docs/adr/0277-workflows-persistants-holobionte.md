# ADR 0277 — Workflows persistants du runtime Holobionte

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Holobionte, orchestration, reçus d'exécution
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0206, ADR 0276

## Contexte

Le runtime savait évaluer une opération de variant et persister son reçu, mais un
appelant devait piloter lui-même la séquence, les révisions de session et les
résultats intermédiaires. Une suite de missions pouvait donc perdre sa progression
ou masquer le fait que des étapes avaient déjà été durablement exécutées.

## Décision

Ajouter un orchestrateur borné de 32 étapes au-dessus de l'évaluation persistante.
Chaque étape réutilise la révision retournée par la précédente et reçoit les
résultats antérieurs. Les reçus restent persistés individuellement par le contrôleur
existant. En cas d'échec, l'orchestrateur arrête la séquence et retourne explicitement
les reçus terminés, la dernière révision, l'identifiant de l'étape fautive et le code
d'échec; il ne prétend pas annuler les effets déjà confirmés.

## Conséquences

### Positives

- Les séquences réutilisent les mêmes contrôles d'autorisation, de preuve et de
  concurrence que l'évaluation unitaire.
- La reprise peut se faire à partir de la révision et des reçus connus.
- Les résultats précédents sont disponibles aux opérations suivantes sans perdre
  leur provenance.

### Limites

- Le workflow n'est pas transactionnel : une défaillance tardive laisse les reçus
  précédents persistés.
- La reprise et les compensations restent sous la responsabilité de l'appelant.
- La borne de 32 étapes limite la taille d'une seule séquence, pas sa durée.

## Alternatives

- Exécuter toutes les étapes dans une transaction globale : rejeté, car les callbacks
  métier et leurs effets externes ne sont pas transactionnels.
- Garder l'orchestration chez chaque appelant : rejeté, car cela duplique la gestion
  des révisions et rend les reçus partiels ambigus.
