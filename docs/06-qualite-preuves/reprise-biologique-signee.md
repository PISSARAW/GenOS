# Reprise biologique avec preuve actuelle

Le test de redémarrage ne doit pas fabriquer un reçu validé depuis le seul résultat
d'une procédure. Il lance désormais le vrai worker par le CLI, obtient les deux
vérifications indépendantes signées, puis interrompt un nouveau processus après
le commit de son observation terminale, avant sa consommation.

Une connexion SQLite séparée confirme ce point d'arrêt avant la terminaison
brutale. Le reçu terminal est absent à cet instant. La réouverture rejoue
l'observation durable, vérifie sa preuve et conserve les invariants de clôture.
Une seconde reprise ne consomme pas les nonces deux fois.

Les contrôles environnement du CLI exercent le filtre réel de secrets, au lieu
de chercher une expression régulière dans un ancien fichier d'implémentation.
Le scénario Trinity utilise seulement les stratégies effectivement prises en
charge ; une stratégie non implémentée reste explicitement refusée.

La matérialisation Syncytium distingue désormais deux contrôles : un reçu
autoproclamé sans vérification sémantique est refusé ; un reçu produit par un
vrai worker et deux processus de vérification permet la clôture du résultat
partagé. Aucun booléen de fixture ne remplace la preuve signée.
