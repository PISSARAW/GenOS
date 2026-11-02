# Référence : GQEL — GenOS Quality Elevation Loop

Le mécanisme **GQEL** (GenOS Quality Elevation Loop) est le composant d'amplification qualitative du runtime GenOS. Il permet d'obtenir, à partir d'un même grand modèle de langage (LLM), un résultat mesurablement supérieur à la génération initiale à travers un cycle itératif de contrôle, d'évaluation sémantique, de diagnostic causal et de réparation dirigée.

---

## 1. Architecture et Cycle d'Élévation

GQEL n'est pas une nouvelle topologie d'agents ; il s'agit d'un protocole transversal qui s'intègre aux exécutions A-Team, Trinity, Workers autonomes et flux orchestrés.

```
                  +---------------------------+
                  |  Mission & Brief Initial  |
                  +-------------+-------------+
                                |
                                v
                  +---------------------------+
                  |    Contrat de Qualité     |
                  | (compileQualityContract)  |
                  +-------------+-------------+
                                |
                                v
               +---------------------------------+
               | LLM — Génération / Version (Vi) |
               +----------------+----------------+
                                |
                                v
               +---------------------------------+
               |     Évaluation Spécialisée      |
               | (qualityEvaluatorRegistry)      |
               +----------------+----------------+
                                |
       +------------------------+------------------------+
       |                                                 |
       v (Score >= Seuil & 0 Défaut bloquant)            v (Défauts détectés)
+--------------+                                  +--------------+
|  Promotion   |                                  |  Diagnostic  |
| du Livrable  |                                  |   Causal     |
+--------------+                                  +-------+------+
                                                          |
                                                          v
                                                  +---------------+
                                                  |  Détection de |
                                                  |  Stagnation   |
                                                  +-------+-------+
                                                          |
                                                          v
                                                  +---------------+
                                                  | Instruction   |
                                                  | de Réparation |
                                                  +---------------+
                                                          |
                                                          +-----> (Boucle vers V(i+1))
```

---

## 2. Politiques d'Élévation

GQEL propose trois politiques prédéfinies :

| Politique | Max Itérations | Seuil Minimal | Évaluations Critiques | Double-Aveugle |
|---|---|---|---|---|
| `fast` | 2 | 70 / 100 | 1 | Non |
| `balanced` | 3 | 80 / 100 | 2 | Non |
| `critical` | 5 | 95 / 100 | 3 | Oui |

---

## 3. Évaluateurs Spécialisés

### Écriture créative (`creative_writing`)
Contrôle formellement :
- Présence d'une logline ou prémisse dramatique claire.
- Fiches de personnages distinctes avec objectifs explicites et secrets.
- Séquencier complet de scènes clés (au minimum 3 scènes).
- Didascalies standardisées (`INT.`, `EXT.`, `JOUR`, `NUIT`).
- Dialogues structurés (minimum 4 répliques équilibrées).
- Note d'analyse dramaturgique matérialisant conflit et tension.

### Ingénierie logicielle (`software_engineering`)
Contrôle formellement :
- Validité syntaxique du code source (analyse machine `vm`).
- Absence de failles de sécurité majeures (injections shell non assainies, secrets codés en dur).
- Déclaration et conformité des exports requis (`module.exports`).
- Présence d'assertions ou de tests unitaires exécutables intégrés.

---

## 4. Détection de Stagnation et Anti-Régression

- **Signature de défauts** : Hachage canonique normalisé (`defectSignature`) des codes et sections de défauts.
- **Détection de répétition** : Lorsque deux itérations consécutives reproduisent exactement la même signature de défauts sans modification de contenu (`CONTENT_UNMODIFIED` ou `DEFECT_SIGNATURE_PERSISTED`), GQEL déclenche une mutation stratégique (`mutate_strategy`) ou interrompt le cycle pour éviter le gaspillage de tokens.
- **Préservation de la meilleure version** : Si la version $V_n$ obtient un score inférieur à $V_{n-1}$ ou réintroduit des défauts précédemment résolus, la version $V_{n-1}$ reste la référence scellée (`bestVersion`).

---

## 5. Intégration aux Preuves et Contrats de Workers

- **Worker Artifact Contract** (`workerArtifactContract.js`) : Vérifie le contrat d'élévation de qualité si configuré sur le worker. En cas d'échec, le worker rejette l'artefact avec le code `WORKER_QUALITY_ELEVATION_FAILED`.
- **Obligation de réparation A-Team** (`teamEvidenceService.js`) : Tout critère d'acceptation non vérifié émet un objet `createRepairObligation` contraignant le sous-graphe à planifier une réécriture ciblée plutôt qu'une promotion prématurée.
