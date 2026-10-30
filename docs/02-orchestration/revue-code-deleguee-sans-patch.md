# Revue déléguée sans modification

Une mission `verifier_worker` portant `delegatedReviewOnly: true` et
`localCodeWorker: true` utilise `genos.test-only/v1` : la liste `patches` doit
être vide, les commandes proviennent du bail parent et `allowFileEdits` doit
être faux. Le runner exécute réellement les commandes sur le snapshot délégué.
Toute mutation observable de la capsule invalide la revue.

Le reçu de test est lié au run du reviewer et le résultat est un
`verification_report`. Son verdict signifie que les commandes exécutées ont
réussi ; il ne prouve pas la correction universelle du programme.
