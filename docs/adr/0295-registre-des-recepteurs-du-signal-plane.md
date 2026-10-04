# ADR 0295 — Registre durable des récepteurs du Signal Plane

- Statut : accepté
- Date : 2026-10-04
- Domaine : Signal Plane, récepteurs, sécurité des périmètres

## Contexte

Les récepteurs déterministes étaient uniquement enregistrés dans une `Map`
locale. Aucun chemin de configuration de production ne les installait et un
redémarrage effaçait leurs règles. Une correspondance était traitée comme une
action réussie même lorsque le dispatcher répondait `executed: false`.

## Décision

Les récepteurs configurés sont stockés dans `signal_receptors` avec une
organisation et un projet obligatoires. L'API authentifiée
`/api/signals/receptors` exige `security:manage` et les deux en-têtes de
périmètre. Elle vérifie les agents ciblés avant l'écriture. Chaque publication
recharge les règles actives avant le matching, ce qui rend les changements
visibles entre processus. Le matching d'une règle durable exige le même
périmètre que celui établi par le routeur. Les règles en mémoire restent
disponibles aux tests et aux intégrations locales.

Seul un résultat `executed: true` atteste un effet déterministe. Lorsqu'aucune
action correspondante ne s'exécute, le signal demande une escalade cognitive
si son contexte de routage est valide.

## Alternatives

- Charger une fois au démarrage : rejeté car les changements d'un autre
  processus ne seraient pas visibles.
- Considérer un récepteur matché comme un succès : rejeté car le dispatcher
  peut refuser ou échouer avant l'effet.

## Conséquences

La lecture du registre à chaque publication ajoute une requête SQLite. Une
configuration sans périmètre explicite est refusée. La migration 099 doit être
appliquée avant de publier des signaux.
