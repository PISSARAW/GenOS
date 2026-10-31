# Consommation cumulée des tentatives d'un worker

Les réparations locales de code peuvent appeler plusieurs fois le modèle dans
un même run. Le reçu terminal de succès, de refus ou d'échec reconstitue désormais
`usage` depuis `model_attempt_ledger`, avec l'identifiant exact du run et du worker.
Il additionne chaque tentative appelée dont les tokens proviennent du fournisseur.
Les tentatives d'un autre run, d'un sibling ou sans appel sont exclues.

`modelUsageAccounting` précise le périmètre `execution_run_measured_total`, le run,
les identifiants des tentatives et leur ventilation par modèle et fournisseur.
Les champs `model` et `provider` du terminal désignent toujours le producteur du
résultat final ; la ventilation décrit séparément les appels des réparations et
des fallbacks. Le cumul ne les réattribue pas tous à ce producteur final.

Une tentative appelée avec une estimation ou sans mesure exploitable apparaît
dans `unmeasuredAttemptIds` et rend `complete` faux. Les tokens connus restent un
sous-total mesuré ; si aucun appel n'a de mesure fournisseur, `usage` est absent.
Un compteur inconnu ne devient jamais une consommation nulle mesurée. Le coût
n'est additionné que si chaque tentative incluse possède un coût numérique connu.
L'inspection de campagne conserve ce bilan ; l'évaluateur classe un bilan
`complete: false` comme `unmeasured`, même si le sous-total connu est positif et
le modèle du terminal correspond au modèle demandé. Un appel antérieur mesuré
ne prouve pas la consommation d'un producteur final sans mesure.

Lors du calcul des métriques du run, un reçu cumulatif n'ajoute que la différence
positive avec les compteurs déjà enregistrés. Un événement d'usage intermédiaire
et le résumé terminal ne comptent donc pas deux fois la même tentative. Les
événements ordinaires conservent leur comportement d'incrément antérieur.

Vérification : `node backend/tests/test_worker_retry_usage_totals.js` exécute le
vrai routeur de tentatives et la boucle de réparation avec un fournisseur simulé.
Il rapproche ledger, terminal et métriques SQLite pour trois tentatives menant au
succès et deux menant à un arrêt sans progrès, avec consommation déjà enregistrée,
modèles distincts, compteurs inconnus, estimations et mauvais run ou worker.
