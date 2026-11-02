# Expérience — Mission Scénario sous GQEL V2 Grounded du 2 novembre 2026

- **Type** : Rapport d'expérience / Exécution terrain GQEL V2
- **Statut** : Exécuté en direct sur LLM local réel (`llama3.1:8b` via Ollama)
- **Modèle auteur** : `llama3.1:8b` (serveur Ollama local, 100% GPU)
- **Modèles reviewers** : `reader-1` et `reader-2` (`llama3.1:8b`)
- **Domaine** : Écriture créative (`creative_writing`), profil `screenplay`
- **Date** : 2026-11-02
- **Répertoire d'artefacts** : `artifacts/gqel-v2-1793651641727`
- **Contrat** : `gqel-e610d738-f947-49e0-8278-df096a60e0a4` (`fa01eb202316447e19ebc5f6b39bfadbb376ef7773ae60d70da27ea0364d2629`)
- **Session** : `65457ef4-3be9-4c28-be5b-9d414a1a3e6f`

---

## 1. Contexte et Objectif

À la suite de l'intégration de **GQEL V2 Grounded** dans la branche `v3`, cette campagne met à l'épreuve le nouveau pipeline narratif en deux phases (plan causal préalable validé sémantiquement, puis rédaction scène par scène) et le mécanisme d'ancrage textuel strict (*evidence grounding*) sur le modèle local `llama3.1:8b`.

La mission demandée est l'écriture intégrale du court-métrage dramatique *« Le Dernier Sas »* :
- Station orbitale de recherche, sas endommagé et fuite de pathogène.
- Alain et Vera doivent décider qui ferme manuellement le sas depuis l'extérieur.
- Contraintes : nécessité causale de l'opération, échec des alternatives, impossibilité du retour, motivations et peurs distinctes influençant l'action, refus des résumés d'action.

---

## 2. Déroulement du cycle GQEL V2

### Phase 0 : Calibration des évaluateurs (*Reviewer Smoke Controls*)

Avant toute génération pour la mission, les deux évaluateurs configurés (`reader-1` axé sur la causalité et `reader-2` axé sur la continuité) sont soumis à deux cas de contrôle étalons (*smoke fixtures*) :
1. Cas négatif (`absence`) : action annoncée abstraitement sans gestes physiques (`fail` attendu).
2. Cas positif (`enacted`) : découverte montrée par gestes concrets décrits pas à pas (`pass` attendu).

**Résultat de calibration** :
- `reader-1` : 2/2 contrôles validés (`passed: true`).
- `reader-2` : 2/2 contrôles validés (`passed: true`).
- Citations exactes ancrées dans le texte de test (`start`, `end`, `quote`).

### Cycle des 4 itérations (*Elevation Loop*)

| Round | Étape exécutée | Diagnostic GQEL | Décision / Effet |
|---|---|---|---|
| **Round 1** | Génération plan causal $P_1$ | Somme des durées prévues = 26 min (hors tolérance cible $20 \pm 20\%$) | **Rejet structurel immédiat** (`GQEL_PLAN_INVALID`). Aucun jeton gaspillé en rédaction de scènes. |
| **Round 2** | Réparation $P_2$ avec obligation de durée | Somme des durées = 30 min (hors tolérance cible) | **Rejet structurel immédiat** (`GQEL_PLAN_INVALID`). Checkpoint émis, obligation réinjectée. |
| **Round 3** | Réparation $P_3$ avec durées conformes | Durées conformes ($20 \pm 4$ min). Soumission aux évaluateurs `reader-1` et `reader-2`. | **Rejet critique** (`GQEL_PLAN_REJECTED`) : couverture incomplète des contraintes causales du brief (`brief_coverage`). |
| **Round 4** | Réparation $P_4$ avec couverture du brief | Couverture du brief acceptée. Mais les critiques rejettent `causal_chain` et `character_actions` : motivations indifférenciées (« sauver l'équipage » pour les deux personnages). | **Rejet critique** (`GQEL_PLAN_REJECTED`). Plafond budgétaire de 4 itérations atteint. |

---

## 3. Données de mesure et Bilan budgétaire

- **Statut final** : `needs_review` (porte fermée, non promu).
- **Promoted** : `false`.
- **Gain artistique revendiqué** : Aucun (le modèle seul n'a pas surmonté les exigences du contrat).
- **Consommation réelle** :
  - Appels LLM totaux : **12 appels** (4 contrôles de calibration + 4 générations de plan + 4 évaluations critiques).
  - Jetons consommés : **23 365 tokens**.
  - Durée totale : ~2 minutes 15 secondes sur GPU local.
  - Checkpoints persistés : `checkpoint-1.json` à `checkpoint-4.json`, `contract.json`, `report.json`.

---

## 4. Enseignement fondamental : Où est le scénario ?

Dans une approche classique par prompt direct (« écris un scénario »), le LLM aurait déroulé 1 500 mots de dialogue de surface masquant une dramaturgie incohérente, des personnages interchangeables et une absence de nécessité causale.

Dans **GQEL V2 Grounded** :
1. **La porte refuse de rédiger des scènes sur un plan dramatiquement infondé.** Le runtime bloque la rédaction en amont dès lors que le plan ne satisfait pas les critères durs de causalité et d'actions des personnages.
2. **Le système applique la règle d'or de GenOS** : *« Un transport réussi n'est pas la preuve d'une décision valide. Ne jamais feindre le succès. »*
3. **Le livrable reste en statut `needs_review`**, avec l'ensemble des diagnostics causaux, citations textuelles et plans intermédiaires scellés dans le dossier d'artefacts pour révision ou changement de stratégie.
