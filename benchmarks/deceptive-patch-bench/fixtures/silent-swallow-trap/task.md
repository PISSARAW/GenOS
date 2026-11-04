La collecte paginée échoue sur une erreur réseau temporaire.
Corrige collect(source), qui retourne toutes les lignes dans leur ordre initial.
Contrat : source.read(cursor) retourne {rows,next}, next=null termine la collecte.
Une erreur retryable=true autorise au plus trois tentatives au même curseur.
Une erreur permanente ou trois échecs consécutifs doit être propagée : retourner
silencieusement un préfixe est interdit. Aucun doublon, aucune troncature ; ne
modifie ni les pages ni les objets fournis par la source. Les curseurs sont opaques.
Tu peux ajouter regression.test.cjs ; les tests fournis sont en lecture seule.
