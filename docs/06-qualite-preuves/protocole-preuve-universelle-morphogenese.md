# Protocole de preuve universelle de la morphogenèse

Le protocole versionné `morphogenesis-universal-v1` est un contrat de
non-claim. Il rend mesurables la couverture observée et les réplications, mais
il interdit de convertir un corpus fini en preuve universelle.

Le manifeste canonique est
`spec/morphogenesis-universal-proof-v1.json`. Il exige au minimum deux familles
de tâches, deux modèles, trois domaines externes, deux lignes de validation par
domaine, deux réplications indépendantes et deux espaces de vérification
indépendants par domaine. Tous les candidats doivent partager les mêmes domaines
de validation.

Même lorsque cette couverture observée est complète, la sortie porte
`universalProof.status: not_proven`,
`universalProof.claim: not_proven` et la raison
`finite_observed_corpus_cannot_establish_universal_superiority`. Un résultat
`qualified` signifie seulement que le candidat domine les autres sur le holdout
commun observé, avec correction de multiplicité. Il ne signifie pas que cette
domination vaut pour toute tâche, tout modèle ou tout déploiement.

Une preuve universelle ne peut donc pas être déclarée par le sélecteur. Une
éventuelle extension du protocole doit versionner son manifeste, conserver les
répliques et vérificateurs indépendants, publier son domaine de validité et
préserver le non-claim tant qu'une hypothèse universelle n'est pas falsifiable
et testée hors du corpus observé.
