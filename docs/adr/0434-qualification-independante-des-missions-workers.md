# ADR 0434 — Qualification indépendante des résultats de mission workers

- **Statut** : Accepté pour un contrôle autonome ; intégration au parcours de campagne ouverte.
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
`verified` dans un JSON exporté. L'intégration de ce gate à la campagne et à un
registre durable de nonces reste à faire ; aucun 19/19 nouveau n'est revendiqué
par cet ADR.

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
