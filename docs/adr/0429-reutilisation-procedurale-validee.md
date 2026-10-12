# ADR 0429 — Réutilisation procédurale validée avant le routage modèle

Statut : accepté pour le chemin `modelRouter.generate`.

## Contexte

Le routeur cherchait un fournisseur avant de consulter les procédures promues. Une
procédure valide était donc inutilisable lorsqu'aucun modèle n'était configuré.
Le reçu de promotion n'était pas borné dans le temps et l'entrée courante n'était
pas liée aux traces qui avaient servi à sa compilation.

## Décision

Le routeur essaie d'abord la réutilisation, sauf en continuité fournisseur. Il ne
résout les modèles qu'après un échec sûr de la sélection procédurale. La procédure
promue porte les empreintes des entrées validées. La réutilisation exige une
partition et une signature de contexte compatibles, une entrée identique ou une
généralisation explicite du validateur, un reçu intact et non expiré, puis un
contrôle de son autorité par `cognitiveProcedureReceiptValidator`. Le résultat
est contrôlé par `cognitiveProcedureResultValidator`.

Une erreur d'exécution ou un résultat rejeté après le début des étapes est
terminal pour cette tentative : un repli automatique pourrait répéter des effets.
Un refus avant exécution laisse le routage modèle disponible. Le résultat expose
le statut et la raison du refus dans `cognitive.procedural.reuse` ; une procédure
réutilisée annonce zéro appel et zéro token de modèle.

## Limites

Le validateur de reçu doit être fourni par l'intégration ; aucun registre de
confiance universel n'est implicitement supposé. Les anciennes procédures, qui
ne lient ni entrée ni expiration à leur reçu, échouent en mode fermé. Le compteur
zéro concerne les appels modèle de cette réutilisation ; le coût de vérification
et le coût total de mission relèvent du journal des tentatives.

## Vérification

`node backend/tests/test_procedural_compilation_service.js` couvre la
réutilisation sans route modèle, les entrées étrangères, les contextes distincts,
le reçu non vérifié ou altéré, l'expiration et un résultat invalide.
