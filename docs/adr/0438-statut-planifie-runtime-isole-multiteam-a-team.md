# ADR 0438 — Statut planifié du runtime isolé Multiteam A-Team

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : A-Team, variant `multiteam`, exécution

## Contexte

`executeVariantMission` avec le variant `multiteam` composait les sous-équipes, contrats,
budget et conseil, puis le wrapper général attribuait `SUCCEEDED`. Ce chemin
ne créait ni n'exécutait de TeamRuns enfants et ne vérifiait aucune clôture.
Le statut confondait un plan valide avec une mission multi-équipe réalisée.

## Décision

- Le runtime de variant peut conserver un statut de sortie explicite. Le
  wrapper n'attribue `SUCCEEDED` qu'aux variants dont le statut demeure
  `STARTED` après l'opération.
- Multiteam termine sa composition avec `PLANNED` et la raison
  `verified_subruns_unavailable`. Ses événements de sous-équipes et de
  résolution de conflit restent des plans.
- La promotion réelle reste au runner de programme et à sa future autorité
  serveur de budget et de contrats inter-équipes. Le simple plan ne la déclenche
  pas.

## Conséquences

Les consommateurs de cette API doivent traiter `PLANNED` comme un résultat
non terminal pour la mission. Les autres variants conservent leur statut
antérieur. Le runner de programme reste fermé à `SUCCEEDED` tant que ses
reçus d'exécution, de budget et de contrats ne sont pas authentifiés.

## Alternatives

Conserver `SUCCEEDED` après la seule composition aurait laissé une réussite
sans preuve des sous-runs. La promotion attend les reçus du runner serveur.
