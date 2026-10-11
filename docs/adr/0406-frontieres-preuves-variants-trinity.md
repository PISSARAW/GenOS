# ADR 0406 — Frontières de preuve des variants Trinity

## Statut

Accepté, avec qualification de mission réelle encore ouverte.

## Date

2026-10-11

## Domaine

Trinity, snapshots topologiques, prédiction oracle, récursion.

## Contexte

Le reçu de sélection automatique porte `variant: composed` et conserve le preset
effectif dans `selectedPreset`. Le snapshot topologique exigeait directement le
nom du preset et refusait donc cette sélection. Le runtime Oracle pouvait noter
une distribution présente dans n'importe quel rapport final, sans prouver son
antériorité. Enfin, une récursion arrêtée par une limite était considérée comme
une exécution complète du variant.

## Décision

Le snapshot Trinity résout `selectedPreset` lorsque la sélection persistée est
`composed`. Il vérifie que le plan expérimental persisté est exactement le plan
compilé du preset demandé. Une divergence refuse la capture ou la reprise ; le
manifeste conserve l'identité du preset et ses références collectives restent en
lecture seule.

Le monde Oracle est le monde 1. Sa prédiction doit apparaître dans un rapport
persisté par le serveur avant le premier rapport de résultat des mondes 2 et 3.
Le reçu lie l'identité de l'agent, l'identifiant monotone de l'événement, le
hash de la prédiction et le hash du rapport comparé. Sans cette frontière, le
runner déclare l'exécution incomplète et le gate empêche la promotion. L'ordre
du journal prouve l'antériorité des écritures observées, pas la qualité de la
prédiction ni une indépendance causale absolue.

Une récursion `recursion_blocked` conserve son motif borné, mais ne satisfait
plus le gate de complétude. Seuls une preuve enfant `verified` ou l'absence de
sous-problème `no_subproblem` permettent de poursuivre.

## Conséquences

Les douze presets peuvent être capturés après sélection automatique lorsque
leur plan persisté est cohérent. Le variant Oracle peut escalader si les pairs
publient un résultat avant sa prédiction, même si la distribution est bien
formée. Les expériences récursives bloquées escaladent explicitement.

Le chemin direct de comparaison doit disposer des événements de télémétrie
persistés pour qualifier Oracle ; une sortie en mémoire seule ne constitue pas
un reçu d'antériorité. La campagne R3 pré-correctifs ne qualifie pas ces
nouveaux gates de bout en bout.

## Alternatives

Accepter la présence d'une distribution dans le rapport final autorisait une
prédiction postérieure aux résultats. Traiter les limites de récursion comme un
succès aurait confondu arrêt sûr et sous-problème résolu. Une phase Oracle
séquentielle dédiée pourrait réduire les refus liés à l'ordre d'exécution,
mais changerait le protocole de lancement parallèle des mondes.
