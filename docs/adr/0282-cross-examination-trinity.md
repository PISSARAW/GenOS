# ADR 0282 — Lier la falsification adversariale à la barrière Trinity

## Statut

Acceptée.

## Contexte

Le variant `adversarial_cross_examination` affectait le rôle et le prompt du troisième monde, mais le chemin de comparaison n'invoquait pas l'adaptateur adversarial. La barrière pouvait donc présenter un refus sans contre-exemple comme une falsification exécutée.

## Décision

Après la phase scellée, le worker désigné reçoit les dossiers des deux autres mondes et doit produire des attaques structurées. Les attaques sans claim cible, contre-exemple descriptif ou étape de reproduction sont rejetées. Une réfutation de défense ne compte que si un vérificateur explicite la valide. Le variant escalade si aucune attaque exploitable n'est produite ou si une adjudication reste indécise.

## Conséquences

Le variant coûte une phase d'inférence additionnelle. Il ne peut plus réussir par la seule présence d'un rôle `red_worker`; les résultats sans attaque vérifiable restent non fusionnables.
