# Addendum préconfirmatoire v3.7 — schéma de réponse simple pour les défis

Date : 2026-10-22, après la réponse C `self_model_masked` mal formée et avant les générations suivantes.

La capture brute v3.5 a montré une réponse `unresolved` qui contenait une évaluation de niche puis un tableau d'incertitudes corrompu; GenOS a rejeté la réponse avant l'oracle. Pour isoler si le schéma JSON conditionnel `if/then/else` du contrat specialist contribue à ce défaut, les missions d'identité utiliseront un schéma dédié sans conditionnel : `outcome`, `claims`, `uncertainties` et `specialtyAssessment` seront tous toujours présents. La validation d'artefact native du worker specialist continue de s'appliquer quand `outcome` est `success`; les réponses `unresolved` restent évaluées par l'oracle et ne portent aucune claim.

Le gabarit d'abstention C comprend désormais `specialtyAssessment` avec niche constante et preuve `mission`. Il ne contient ni confiance ni décision. L'oracle, le modèle, les traitements et le seuil restent inchangés. Les sorties v3.5 restent des échecs non réévalués.
