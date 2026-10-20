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

`verifyGoal` peut fournir un reçu `genos.biome-goal-verification-receipt/v1`.
Ce reçu lie explicitement la mission, le producteur, le vérificateur, la session,
le tick et les références de preuves. Son attestation est l’empreinte canonique
de ces champs. Le runtime conserve le reçu fourni sans inventer d’identité.

La clôture spécialisée Biome exige ensuite que :

- l’identité du vérificateur soit distincte de celle du producteur ;
- le reçu corresponde à la mission, à la session et au tick terminaux ;
- son attestation soit intacte ;
- ses preuves appartiennent aux reçus de workers disponibles.

Une absence de reçu reste partielle. Une identité, une portée, une attestation
ou une référence falsifiée échoue explicitement.

## Conséquences

Les usages écologiques historiques peuvent toujours utiliser `verifyGoal` sans
ce reçu, mais ils ne satisfont pas le gate de clôture de mission. Un fournisseur
de vérification destiné à la clôture doit publier son identité et l’attestation
liée au producteur et aux preuves qu’il a réellement examinées.
