# Expérience — Mission Scénario réel sous GQEL du 2 novembre 2026

- **Type** : Preuve / Rapport d'expérience d'amplification de qualité LLM
- **Statut** : Exécuté en direct et validé sur modèle local réel
- **Modèle testé** : `llama3.1:8b` (serveur Ollama local, 100% GPU)
- **Domaine** : Écriture créative (`creative_writing`), scénario dramatique
- **Date** : 2026-11-02
- **Réf. Contrat** : `gqel-contract-1793643196886-a80bf6`
- **Session** : `gqel-session-1793643196888-94efd7`

---

## 1. Contexte et Objectif

L'objectif de cette expérience terrain est de tester en conditions réelles le mécanisme **GQEL (GenOS Quality Elevation Loop)** :
> Avec le même modèle (`llama3.1:8b`), GenOS est-il capable de diagnostiquer les défauts structurels d'un premier jet, de guider causalement la réécriture sans intervention humaine, et de mesurer formellement le gain qualitatif tout en appliquant une porte de refus fail-closed ?

La mission demandée est l'écriture complète du scénario d'un court-métrage dramatique de science-fiction intitulé *Le Dernier Sas*.

---

## 2. Déroulement du cycle d'élévation GQEL

### Version 1 — Premier jet brut (génération sans boucle)
- **Score mesuré** : **20 / 100**
- **Défauts constatés** : 7 défauts critiques identifiés par l'évaluateur sémantique :
  - `MISSING_LOGLINE` : Absence de prémisse dramatique formelle.
  - `INSUFFICIENT_CHARACTERS` : Moins de deux fiches de personnages complètes.
  - `SHALLOW_CHARACTER_PROFILES` : Secrets et objectifs non explicites.
  - `MISSING_STAGE_DIRECTIONS` : Absence de didascalies standard (`INT.`, `EXT.`).
  - `INSUFFICIENT_DIALOGUE_TURNS` : Moins de 4 répliques dialoguées structurées par personnage.
  - `WEAK_DRAMATIC_STRUCTURE` : Tension dramatique et conflit non matérialisés.
  - `MISSING_DRAMATURGIC_NOTE` : Absence d'analyse critique dramaturgique.

### Version 2 — Première boucle de réparation causale
- **Action GQEL** : Génération d'une directive de réparation ciblant les 7 défauts sans réécriture aléatoire.
- **Score mesuré** : **30 / 100** (+10 points).
- **Progrès** : Résolution du défaut `MISSING_STAGE_DIRECTIONS` ; début de structuration de la station orbitale.

### Version 3 — Deuxième boucle de réparation causale
- **Action GQEL** : Analyse différentielle ($V_2 - V_1$), préservation des acquis et renforcement de l'injonction sur les personnages, la prémisse et le conflit.
- **Score mesuré** : **75 / 100** (**Gain net : +55 points**).
- **Défauts résolus** (4 résolutions majeures) :
  - Intégration d'une logline claire (`Prémisse dramatique`).
  - Fiches complètes d'Alain (45 ans, pilote, blessure/anxiété cachée) et de Vera (38 ans, ingénieure en chef, peur du contrôle).
  - Séquencier en trois actes distincts (`INT.` et `EXT. Horizon`).
  - Conflit dramatique fort (dilemme du sacrifice externe face au pathogène).

---

## 3. Comportement de la porte de promotion

Le seuil d'exigence contractuel pour la politique `balanced` est fixé à **80 / 100**.

- Score final atteint : **75 / 100**.
- Défauts résiduels : 2 (didascalies de dialogue à enrichir, note critique).
- **Décision du runtime** :
  - `Statut final` : **`PARTIALLY_IMPROVED`**
  - `Promu` : **`false`**
  - `Best Version retenue` : **$V_3$ (75 / 100)** scellée dans le registre d'état.

Le système fait exactement ce qui est prescrit par les règles épistémiques de GenOS :
1. Il refuse de déclarer un succès artificiel ou de contourner la porte de qualité.
2. Il conserve et prouve l'élévation qualitative (+55 points d'amélioration mesurée).
3. Il conserve la traçabilité intégrale des 3 versions et des comparaisons différentielles.

---

## 4. Données d'exécution et artefacts

- Scénario complet extrait : [`artifacts/scenario-le-dernier-sas.md`](file:///c:/Users/Shadow/Documents/GitHub/GenOS/artifacts/scenario-le-dernier-sas.md)
- Script d'exécution : [`scripts/experiments/run_writing_mission_gqel.cjs`](file:///c:/Users/Shadow/Documents/GitHub/GenOS/scripts/experiments/run_writing_mission_gqel.cjs)
- Rapport de session brut : [`scripts/experiments/scenario_gqel_execution_report.json`](file:///c:/Users/Shadow/Documents/GitHub/GenOS/scripts/experiments/scenario_gqel_execution_report.json)

---

## 5. Texte intégral du scénario produit (Version $V_3$)

```text
Titre : Le Dernier Sas
Genre : Court-métrage dramatique
Durée : 20 minutes

Prémisse dramatique :
Dans la station orbitale "Horizon", la vie et la mort sont liées à la sécurité d'un sas principal endommagé. Alain, un pilote expérimenté, et Vera, une ingénieure en chef, doivent décider qui se sacrifiera pour fermer le sas de l'extérieur, menaçant ainsi leur propre vie.

Synopsis :
Dans la station orbitale de recherche "Horizon", les scientifiques travaillent sans relâche pour avancer dans les connaissances de l'univers. Lorsque le sas de dépressurisation principal est endommagé, deux officiers, Alain et Vera, sont chargés de résoudre le problème pour sauver la station et ses occupants. Mais leur mission prend un tournant dramatique lorsqu'ils découvrent une fuite de pathogène qui s'est échappé à l'intérieur de la station. Pour éviter une catastrophe, il faut fermer le sas de l'extérieur, ce qui implique qu'un des officiers doit se sacrifier en s'extirpant de la station pour effectuer cette opération.

Fiches de personnages :
1. Alain :
- Âge : 45 ans
- Profil : Pilote expérimenté, ancien militaire, doté d'une grande expérience dans les situations critiques
- Objectif : Sauver la station et ses occupants en fermant le sas principal
- Secret : Il cache une blessure physique et une anxiété profonde face à la mort
- Qualité : Courage, loyauté, sacrifice

2. Vera :
- Âge : 38 ans
- Profil : Ingénieure en chef, responsable de la station, experte en sécurité
- Objectif : Sauver la station et ses occupants en fermant le sas principal
- Secret : Elle cache une peur de la mort et de la perte de contrôle
- Qualité : Loi, responsabilité, détermination

Scénario :

Acte I :
INT. LA STATION "HORIZON" - JOUR
Nous sommes au cœur de la station orbitale "Horizon", où des scientifiques et des techniciens travaillent. L'atmosphère est tendue, et les yeux de tous les occupants sont fixés sur le sas principal, qui a été signalé endommagé. Alain et Vera, deux officiers expérimentés, sont convoqués en urgence pour résoudre la situation.

Alain (à Vera) : "Nous devons agir vite. Le sas principal est endommagé. Nous devons trouver la cause et résoudre le problème avant qu'il ne soit trop tard."
Vera : "Je connais les données. Nous devons inspecter le sas et rechercher les causes de l'endommagement."

Acte II :
INT. LA STATION "HORIZON" - JOUR
Alain et Vera inspectent le sas, consultent les données, et interrogent les occupants de la station. C'est là qu'ils découvrent la fuite de pathogène. La situation devient critique, car le pathogène est potentiellement mortel pour les occupants de la station.

Alain (à Vera) : "Le pathogène est potentiellement mortel. Nous devons fermer le sas de l'extérieur, mais cela signifie que l'un d'entre nous doit se sacrifier."
Vera : "Je ne peux pas le faire. Je suis la responsable de cette station. Je ne peux pas abandonner mes collègues."
Alain : "Je comprends, mais je suis le plus expérimenté. Je suis prêt à me sacrifier pour sauver la station et ses occupants."

Acte III :
EXT. LA STATION "HORIZON" - JOUR
L'officier qui a décidé de se sacrifier, Alain, se prépare à sortir de la station pour fermer le sas. La scène est intense, remplie d'émotion et de sacrifice. 

Vera (à Alain) : "Merci, Alain. Tu as sauvé la station et ses occupants. Tu es un héros."
Alain : "Je n'ai fait que mon devoir. Je suis prêt à mourir pour sauver la vie d'autrui."

INT. LA STATION "HORIZON" - JOUR
Après que le sas a été fermé, Vera retourne à l'intérieur de la station, où les occupants, qui ont été sauvés grâce au sacrifice d'Alain, l'accueillent avec une grande reconnaissance. 

Conclusion :
"Le Dernier Sas" est un court-métrage dramatique qui met en avant la bravoure, la loyauté et le sacrifice. Il montre comment, face à une situation critique, des décisions difficiles doivent être prises pour sauver les autres. Le scénario est une métaphore de la vie, où les sacrifices sont parfois nécessaires pour sauver d'autres vies.
```
