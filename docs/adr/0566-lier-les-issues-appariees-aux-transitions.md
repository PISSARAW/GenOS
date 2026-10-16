# ADR 0566 — Lier les issues appariées aux transitions scellées

- **Statut** : Accepté pour la dérivation contrôlée ; collecte comparative à compléter
- **Date** : 2026-10-16
- **Lié à** : ADR 0554, 0564

## Contexte

Le registre de l'ADR 0564 acceptait une ligne signée contenant quatre mesures,
mais ne pouvait pas reconstruire la paire d'exécutions à l'origine du gain.
La lecture des 120 dernières lignes d'un périmètre pouvait aussi évincer les
échantillons d'un candidat encore pertinent. Le banc de changement de régime
ne distinguait pas un identifiant de transition mentionné en télémétrie d'un
reçu de transition scellé et d'une résolution liée au même identifiant.

## Décision

`morphogenesisPairedOutcomeProducer` dérive une ligne de calibration à partir
d'une tentative candidate et d'un contrôle sur la même tâche, graine, famille,
modèle, politique d'outils et plafonds de tokens et de latence. Chaque tentative
doit porter un reçu d'oracle indépendant signé sur ses mesures. La prédiction
doit être signée et enregistrée avant les deux démarrages. Le candidat doit
porter un reçu de transition scellé, une file et des résultats complets dont
les workers correspondent exactement aux bindings du reçu. La ligne dérivée
lie les preuves sources dans son empreinte. Son gain est signé : une régression
vaut un gain négatif, et le surcoût combine les écarts positifs de tokens et de
latence rapportés aux plafonds communs.

Le producteur **ne signe pas** la ligne dérivée. Son enregistrement exige un
reçu final émis par un vérificateur indépendant sur l'empreinte de cette ligne.
Ce reçu doit venir d'un espace distinct des deux tentatives et être daté après
leurs verdicts sources.
Le registre refuse désormais toute nouvelle ligne sans paire complète et
écarte à la lecture les anciennes lignes signées sans ces preuves. Cela peut
rendre un corpus historique temporairement indisponible ; il doit être
reconstitué à partir des exécutions et vérifié, jamais promu par migration de
champs.

La lecture conserve jusqu'à 40 lignes d'entraînement et 20 de validation par
candidat, avec un plafond total de 8192. Ce plafond permet de conserver le
minimum 30/10 de plusieurs variants simultanément. Le calibrateur vérifie
également la disjonction des identifiants de tâches entre entraînement et
validation pour les nouvelles paires, en plus des familles et des modèles.

L'adaptateur du banc comparatif n'expose un candidat que si l'événement de
démarrage porte un reçu scellé valide. Il distingue la résolution vérifiée
liée à ce même `transitionId`. Ces observations ne deviennent pas des issues
de calibration par leur seule présence dans le rapport de campagne.

## Limites

Le harnais de campagne actuel n'émet pas de reçus d'oracle indépendants sur
chaque tentative, ni de reçu indépendant sur la paire dérivée. Le producteur
est donc une voie d'ingestion sûre pour de telles preuves, pas un générateur de
corpus confirmatoire. Les fixtures signées des tests démontrent les contrôles
et les refus de falsification, pas un gain observé de GenOS. Le protocole de
changement de régime partage encore un modèle entre entraînement et holdout ;
il ne peut pas, tel quel, satisfaire le holdout hors modèle du calibrateur.

La requête stratifiée examine les lignes du périmètre avant d'appliquer son
plafond de sortie. Son coût doit être mesuré sur un grand corpus ; une colonne
et un index dédiés au candidat pourront remplacer l'extraction JSON si besoin.

## Alternatives

- Signer localement les verdicts du harnais comme indépendants : rejeté ; un
  verdict calculé dans le même processus ne prouve pas l'indépendance requise.
- Déduire le gain d'un seul rapport de worker : rejeté ; aucune paire appariée
  ni contrôle de budget commun n'est disponible.
- Conserver seulement les 120 dernières lignes globales : rejeté ; plusieurs
  candidats peuvent perdre tous leurs échantillons de validation.
