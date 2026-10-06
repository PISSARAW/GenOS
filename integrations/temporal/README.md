# Reprise des activités externes avec Temporal

Le ledger SQLite `reconciliation.py` marque une opération `in_flight` avant
l'effet externe. Si son accusé de réception est perdu, l'état devient
`uncertain` ; une reprise demande une réconciliation explicite au lieu de
répéter l'effet. `workflow.py` fournit une façade Temporal qui observe cet
état avec une activité non réessayée et renvoie `reconciliation_required`.

Test local sans serveur : `python integrations/temporal/test_reconciliation.py`.
Pour le workflow réel, installer `temporalio` et configurer
`GENOS_TEMPORAL_LEDGER`, puis enregistrer `ReconcileWorkflow` et
`inspect_operation` dans un worker Temporal. Le test ne démarre pas le serveur
Temporal. Ce prototype ne remplace pas la continuité SQLite de GenOS.

Source : [Temporal Python SDK](https://github.com/temporalio/sdk-python).
