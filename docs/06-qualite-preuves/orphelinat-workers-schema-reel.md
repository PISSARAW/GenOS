# Orphelinat : budget persistant et admission effective

Le budget figé lors d'une admission est lu dans `agents.cognitive_budget`, champ
du schéma réel. `current_budget` n'existe pas dans ce schéma. La fixture du test
`test_worker_orphanage.js` utilise le même nom pour éviter de masquer une erreur
SQL par une table de test incompatible avec la production.

Sans territoire, `admitWorker` retourne `admitted: false` et
`reason: territory-required`. La réconciliation ne compte que les admissions
effectives et n'émet pas `UNTRACKED_WORKER_RECONCILED` après un refus ou une
exception. Un transport réussi ou une tentative d'admission ne constitue pas
une preuve d'entrée dans le sas.
