# 0708 — Reçu d’oracle indépendant pour la clôture Biome

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : Biome, clôture de mission, preuves

## Contexte

L’adaptateur de clôture Biome déclarait un identifiant de vérificateur constant
après avoir observé une simple réponse positive de `verifyGoal`. Cette valeur
était produite par l’adaptateur lui-même : elle ne prouvait donc ni l’identité
du vérificateur, ni son indépendance vis-à-vis du producteur, ni le périmètre
exact de son attestation.

## Décision

`verifyGoal` peut fournir un reçu `genos.biome-goal-verification-receipt/v2`.
Ce reçu n’accepte plus un alias libre comme identité du vérificateur. Il utilise
l’autorité `proof` du registre central et un reçu HMAC produit par
`epistemicVerifierReceiptService`. L’identité de cette autorité est son digest
enregistré ; ses alias connus sont normalisés avant le contrôle d’indépendance.

Le reçu scelle un sujet canonique comprenant la mission, le producteur, la
session, le tick, toutes les références de preuves workers, les mesures, la
santé écologique, le verdict du but ainsi que l’état et la cause d’arrêt
terminaux. Une réponse positive de `verifyGoal` n’est donc acceptée par le
runtime que si le reçu signé correspond exactement à ce sujet.

La clôture spécialisée Biome exige ensuite que :

- l’autorité enregistrée soit distincte du producteur, y compris sous alias ;
- le reçu corresponde à la mission, à la session et au tick terminaux ;
- sa signature HMAC et son digest d’autorité soient valides ;
- le statut signé soit exactement `verified` ;
- son sujet corresponde encore à l’état terminal relu ;
- ses preuves couvrent exactement tous les reçus de workers disponibles.

La lecture terminale produit aussi un sceau canonique de la session, de sa
révision, de son état et de son journal d’événements. Le registre de clôture
laisse l’adaptateur Biome relire ce sceau immédiatement avant d’appeler le
contrat commun `closeMission`. Toute divergence rend le dossier caduc et fait
échouer la clôture. Les autres adaptateurs conservent leur chemin générique.

Une absence de reçu reste partielle. Une identité, une portée, une attestation
ou une référence falsifiée échoue explicitement.

## Conséquences

Les usages écologiques historiques peuvent toujours utiliser `verifyGoal` sans
ce reçu, mais leur réponse ne rend plus le but vérifié et ils ne satisfont pas
le gate de clôture. Un fournisseur destiné à la clôture doit disposer de
l’autorité épistémique configurée et signer le sujet complet qu’il a examiné.
Une mutation Biome concurrente ne peut plus promouvoir un dossier construit
sur une révision antérieure, même si ce dossier était valide lors de sa
première lecture.
