# Fermeture du runtime au premier plan

Le statut terminal d'un run peut être enregistré avant la fin de sa finalisation
Garage et de sa décision de reprise. `missionStarts` libère l'identité au début
de cette finalisation pour permettre sa réutilisation ; son absence ne prouve
donc pas que toutes les écritures SQLite sont terminées.

Le CLI suit séparément la durée complète des promesses de démarrage, y compris
leur finalisation. Une mission exécutée dans le processus ne peut plus être
considérée comme terminée ou orpheline tant qu'une de ces opérations reste en
cours. Avant le flush de télémétrie et la fermeture SQLite, le CLI attend aussi
les opérations de reprise créées pendant cette finalisation. Cette attente
conserve les limites d'exécution propres aux opérations ; elle ne transforme
pas un run en succès. Lors d'un arrêt sur erreur, une opération déjà lancée peut
finir sa finalisation avant la fermeture de la base.

Le reçu JSON de `dispatch_worker` se termine par un saut de ligne pour qu'un
message ultérieur sur stderr ne le rende pas illisible dans un log combiné.

Vérification : `node backend/tests/test_runtime_finalization_shutdown.js` utilise
la vraie finalisation de mission et SQLite, avec un finaliseur Garage retardé.
Il vérifie l'écriture finale et une opération imbriquée avant le flush et la
fermeture, ainsi que le refus d'une conclusion terminale ou orpheline prématurée.
