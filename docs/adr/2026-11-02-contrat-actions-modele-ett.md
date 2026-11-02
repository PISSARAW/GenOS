# Contrat explicite des actions modèle ETT

- **Date** : 2026-11-02
- **Statut** : Accepté

## Contexte

Les premiers onze essais de la campagne runtime sur Qwen 7B échouaient sans
`answerId`. Une capture réelle montre une action à plat et des arguments rangés
dans `requiredFields`, alors que les adaptateurs attendaient un objet `action`
avec ses arguments directs. Les réponses non reconnues étaient ignorées : les
appels consommaient des tokens sans produire de trace d'action ni de retour de
rejet à destination du modèle.

## Décision

ETT, le contrôle LLM direct et les politiques concurrentes partagent un contrat
d'action construit exclusivement à partir de l'observation publique courante.
Le prompt et le format structuré fournisseur précisent le conteneur `action`,
les champs directs requis et leurs types. Aucun oracle ni choix de réponse
caché n'entre dans ce contrat.

Le décodeur accepte aussi une action à plat dont les champs sont déjà directs.
Il ne déplace pas les arguments mal formés et ne devine aucune valeur. Une
réponse sans action reconnue est remise au monde comme action invalide : elle
consomme son budget et produit un rejet inspectable. Les politiques concurrentes
reçoivent aussi les rejets, pas seulement les observations réussies.

La réservation avant appel inclut les octets du format structuré. Les reçus
passent à `genos.ett-runtime-campaign/v6` ; une reprise v4 ou v5 est refusée pour ne
pas mélanger des essais réalisés sous des contrats d'adaptateur différents.
Les anciens reçus et leur consommation restent conservés séparément.

L'audit du premier pilote v5 a aussi montré que `executePair` omettait de
transmettre le garde de budget au bras GenOS. Ses compteurs locaux mesuraient
les tokens, mais le journal global ne les recevait pas. Le garde est désormais
transmis aux questions endogènes et aux actions des workers. Le test intégré
exige l'égalité entre appels fournisseur, événements de journal et tokens du
résultat ; un budget insuffisant doit interdire tout appel réel. Les essais v5
ont été arrêtés et ne sont pas repris. Leur absence d'échec technique ne
constituait pas une validation de leur comptabilité globale.

Le pilote réel a ensuite révélé deux défauts masqués par l'absence d'actions :
le worker ajoutait `actions` à une proposition dont le contrat interdit les
champs supplémentaires, puis l'adaptateur omettait la trace d'actions lors de
la vérification métier. Le compteur reste dans le résultat de benchmark,
hors de la proposition scellée. L'oracle reçoit la trace produite par le monde
hôte, distincte de toute déclaration du modèle.

Une fois le monde terminal, le harnais clôt l'épisode par la transition existante
`STOPPED` avec le motif `environment-terminal`. Il n'ouvre pas une enquête de
suivi sur un environnement qui refuse toute nouvelle action et ne réutilise
pas sa réponse comme résultat d'une nouvelle question. Cette clôture ne compte
pas comme continuation ; les boucles synthétiques non terminales conservent
leur comportement précédent.

## Validation et limites

`test_action_response.js` couvre les 36 couples scénario/niveau avec des actions
construites sans oracle, les rejets et leur coût, la transmission du schéma au
fournisseur et le refus avant appel si sa réserve ne tient pas dans le budget.
`test_runtime_campaign.js` vérifie aussi le refus des reprises v4 et v5.
`test_runtime_worker_contract.js` traverse les vrais services backend avec un
fournisseur déterministe : contrat de run, reçu signé de vérification et
contrôles métier sur la trace hôte, y compris pour une réponse réfutée.

Ce correctif rend l'interface exécutable ; il ne garantit ni la pertinence des
questions, ni une réponse correcte, ni une découverte vérifiée. Le corpus reste
de développement et les verdicts négatifs restent dans les résultats.
