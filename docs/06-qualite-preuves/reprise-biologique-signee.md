# Reprise biologique avec preuve actuelle

Le test de redÃ©marrage ne doit pas fabriquer un reÃ§u validÃ© depuis le seul rÃ©sultat
d'une procÃ©dure. Il lance dÃ©sormais le vrai worker par le CLI, obtient les deux
vÃ©rifications indÃ©pendantes signÃ©es, puis interrompt un nouveau processus aprÃ¨s
le commit de son observation terminale, avant sa consommation.

Une connexion SQLite sÃ©parÃ©e confirme ce point d'arrÃªt avant la terminaison
brutale. Le reÃ§u terminal est absent Ã  cet instant. La rÃ©ouverture rejoue
l'observation durable, vÃ©rifie sa preuve et conserve les invariants de clÃ´ture.
Une seconde reprise ne consomme pas les nonces deux fois.

Les contrÃ´les environnement du CLI exercent le filtre rÃ©el de secrets, au lieu
de chercher une expression rÃ©guliÃ¨re dans un ancien fichier d'implÃ©mentation.
Le scÃ©nario Trinity utilise seulement les stratÃ©gies effectivement prises en
charge ; une stratÃ©gie non implÃ©mentÃ©e reste explicitement refusÃ©e.

La matérialisation Syncytium distingue désormais deux contrôles : un reçu
autoproclamé sans vérification sémantique est refusé ; un reçu produit par un
vrai worker et deux processus de vérification permet la clôture du résultat
partagé. Aucun booléen de fixture ne remplace la preuve signée.
