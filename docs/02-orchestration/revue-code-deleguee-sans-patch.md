# Revue déléguée sans modification

Une mission `verifier_worker` portant `delegatedReviewOnly: true` et
`localCodeWorker: true` utilise `genos.test-only/v1` : la liste `patches` doit
être vide, les commandes proviennent du bail parent et `allowFileEdits` doit
être faux. Le runner exécute réellement les commandes sur le snapshot délégué.
Toute mutation observable de la capsule invalide la revue.

Le reçu de test est lié au run du reviewer et le résultat est un
`verification_report`. Son verdict signifie que les commandes exécutées ont
réussi ; il ne prouve pas la correction universelle du programme.

Avant les tests, le runner contrôle l'identité du reviewer, la mission, le hash
du manifeste délégué et les hashes des fichiers candidats. Le reçu de tests
conserve le hash du snapshot, son reçu de délégation et le run producteur ;
la revue reste ainsi rattachée au candidat effectivement testé.

L'assemblage du prompt sépare le bloc d'instructions de code ou de revue du
contexte d'analyse. Cette extraction conserve le texte et la sélection du
protocole : une revue reçoit toujours le format `genos.test-only/v1`, aucun patch
et la même liste de commandes autorisées. Les tests de revue et de lecture seule
contrôlent ces chemins après refactorisation.
