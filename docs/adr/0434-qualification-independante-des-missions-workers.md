# ADR 0434 — Qualification indépendante des résultats de mission workers

- **Statut** : Accepté ; campagne qualifiée disponible par un nouveau point d'entrée.
- **Date** : 2026-10-11.
- **Domaine** : preuves, qualification des workers.
- **Décideurs** : équipe GenOS.
- **Lié à** : ADR 0383, 0398 à 0403 et contrat d'issue de mission.

## Contexte

Le résumé d'une campagne indique que son processus a observé une mission
terminée et un oracle accepté. Exporté seul, ce résumé ne contient ni les deux
reçus d'oracle ni l'état de consommation des nonces. Il ne permet donc pas à un
lecteur indépendant de recalculer la qualification cryptographique. Une preuve
d'enfant ne doit pas être substituée à la preuve du sous-orchestrateur parent.

## Décision

`workerMissionQualificationGate.evaluate` est un contrôle autonome et fermé.
Son appelant fournit la référence attendue issue d'un oracle distinct, le
résultat observé, l'identité de run/worker et exactement deux reçus. Le gate
compare les digests du résultat, exige un run terminé et son événement terminal,
valide la signature des reçus avec un digest de vérificateur enregistré, lie
chaque reçu au résultat et à son propriétaire, et exige deux nonces, acteurs et
stratégies distincts. Un jeu de nonces déjà vus est obligatoire et permet le
diagnostic de replay dans une même session. Son absence produit un inconclusif.
L'abstention et l'inconclusif restent des issues explicites.

Ce contrôle ne remplace pas `nativeOracleProof` : l'oracle natif valide aussi
l'autorité, le journal, la persistance, le temps et la consommation durable des
nonces. Une campagne ne doit pas revendiquer C3 sur la base du seul booléen
`verified` dans un JSON exporté.

Le point d'entrée `backend/tests/run_worker_gate_campaign.cjs` exécute chaque
mission dans un répertoire temporaire isolé, puis relit sa base avant de la
supprimer. `workerMissionQualificationIntegration` retrouve le run terminé par
le digest de décision de l'oracle, vérifie le terminal et la preuve AEIS
courante, compare le contenu formel au résultat observé dans le journal et
soumet les deux reçus signés au gate. Le verdict de campagne est `verified`
uniquement si le gate retourne `verified`. Une preuve absente, expirée,
altérée, ou une mission arrêtée par timeout donne `inconclusive`.

Le registre de nonces du gate est partagé entre les missions de cette campagne ;
la consommation durable des nonces et leur rattachement à la décision restent
contrôlés par l'oracle natif. La clé éphémère de la mission est transmise au
processus local de qualification pendant la lecture des preuves et n'est pas
écrite dans le rapport.

L'ancien point d'entrée `run_worker_qualification_campaign.cjs` reste une
campagne exploratoire : son booléen `verified` ne passe pas par ce gate. Les
consommateurs doivent utiliser le nouveau schéma
`genos.worker-gate-campaign/v1` pour revendiquer cette qualification. Aucun
19/19 qualifié n'est revendiqué par cet ADR.

## Conséquences

- **Positives** : faux résultat, signature altérée, réemploi de nonce et preuve
  d'enfant présentée pour le parent disposent d'épreuves adversariales directes.
- **Négatives** : le gate autonome ne vérifie pas lui-même l'origine de la
  référence attendue ni la réalité de deux processus distincts. Il exige ces
  frontières de confiance de l'appelant et de l'oracle natif.

## Alternatives

- Faire confiance aux booléens du résumé : refusé, car ils ne transportent pas
  les reçus nécessaires à la vérification indépendante.
- Copier toute la logique de `nativeOracleProof` : refusé, car elle dépend de la
  base durable et serait une seconde implémentation de la même autorité.
