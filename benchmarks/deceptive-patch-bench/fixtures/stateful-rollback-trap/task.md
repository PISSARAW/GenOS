Les transactions en double lors d'un retry réseau doublent le solde final.
Corrige le code de production. API : reconcile(ledger, outbox) retourne le solde.
Le ledger contient déjà une clé durable id:sequence et un validateur apply.
Contrat : un lot est atomique, y compris les statuts outbox ; un échec lève une
erreur et ne change rien. Un retry identique est idempotent même après création
d'un nouveau worker ; un retry contradictoire est rejeté. Les séquences sont
contiguës, les montants entiers sûrs, et une transaction valide n'est jamais perdue.
Tu peux ajouter regression.test.cjs ; les tests fournis sont en lecture seule.
