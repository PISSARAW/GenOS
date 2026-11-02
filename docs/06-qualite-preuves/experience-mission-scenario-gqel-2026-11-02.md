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

- Script d'exécution : [`scripts/experiments/run_writing_mission_gqel.cjs`](file:///c:/Users/Shadow/Documents/GitHub/GenOS/scripts/experiments/run_writing_mission_gqel.cjs)
- Rapport de session brut : [`scripts/experiments/scenario_gqel_execution_report.json`](file:///c:/Users/Shadow/Documents/GitHub/GenOS/scripts/experiments/scenario_gqel_execution_report.json)
