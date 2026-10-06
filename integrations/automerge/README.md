# Observations partagées Automerge

`sharedNotes.cjs` crée, modifie, sérialise et fusionne seulement des notes
`observations` avec texte et source. Le schéma refuse tout champ d'autorité,
permission, coût ou promotion. Une fusion CRDT réussie conserve les deux notes
concurrentes, mais ne valide pas leur vérité.

`npm ci --prefix integrations/automerge` puis
`npm --prefix integrations/automerge test`. Ce module expérimental n'est pas
branché au chemin de décision du runtime.

Source : [Automerge](https://automerge.org/docs/).
