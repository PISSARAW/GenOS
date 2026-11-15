# Rejeu des preuves pour les livrables créatifs

- **Statut :** accepté
- **Date :** 2026-11-05
- **Domaine :** workers, replay causal, GQEL, promotion

## Contexte

La politique `require_replay` exige une relecture native avant la promotion. Le chemin
historique appelait toujours `workerCodeReplay`, qui exige une à deux commandes de test
exécutables et autorisées. Un livrable créatif porte pourtant une preuve de revue GQEL
authentifiée dans `tests`, sans commande shell. Le runtime traitait cette preuve comme une
commande absente ou interdite et échouait après une revue GQEL réussie.

Désactiver `require_replay` affaiblirait la porte de promotion. Inventer une commande de
test ne prouverait pas le contenu créatif.

## Décision

Conserver la vérification du snapshot, l’autorité liée au run, l’égalité des empreintes et
la preuve de rejeu causal pour les deux domaines. Pour le code, exécuter uniquement les
commandes réellement présentes, allowlistées et attestées dans le rapport. Pour un
`creative_candidate`, accepter le chemin de preuve sans commande seulement après avoir
revalidé le reçu GQEL authentifié, son contrat, son identité d’exécution et son lien au
contenu exact. Émettre alors un reçu `genos.worker-evidence-replay/v1` lié au rapport et
à la chaîne rejouée. Le contexte de promotion reconnaît ce type de reçu et vérifie ses
empreintes ; un reçu absent ou mal formé reste refusé.

Les décisions de livraison propres au code ne s’appliquent pas aux candidats créatifs.
Les contrôles de commande allowlistée et de réussite des tests de code restent inchangés.

La lecture d’une preuve d’achèvement accepte également un run terminal `awaiting_approval`
si l’observation native `AGENT_COMPLETED` est appliquée, horodatée de façon cohérente et
antérieure à l’expiration de l’autorité. Cette lecture ne change pas le statut et n’approuve
ni ne promeut le run. L’approbation humaine et les gardes de promotion restent séparées;
un A-Team peut ainsi transmettre un résultat achevé au worker suivant sans présenter un
travail en attente comme promu.

## Conséquences

- Une preuve de revue GQEL ne se présente plus comme un test shell.
- Le replay causal du snapshot reste obligatoire avant promotion.
- Le chemin de code garde l’exécution sandboxée de ses tests et ses refus fail-closed.
- Un reçu GQEL expiré, non lié au worker ou lié à un contenu différent ne peut pas établir
  le rejeu créatif.

## Vérification

`backend/tests/test_worker_evidence_replay.cjs` couvre le reçu GQEL lié au contenu, le
rejeu créatif sans commande fictive, le maintien des refus de commandes de code et le
contrôle strict du reçu au point de promotion. Le test est inclus dans `test:workers`.
