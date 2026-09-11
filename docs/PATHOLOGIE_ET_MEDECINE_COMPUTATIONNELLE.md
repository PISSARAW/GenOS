# Pathologie et Médecine Computationnelle GenOS

## 1. Définition

La **médecine computationnelle** dans GenOS est le sous-système clinique et homéostatique chargé de diagnostiquer, réguler, isoler et soigner les dérèglements pathologiques survenant au sein du réseau d’agents autonomes (*AgentCells*).

Dans un essaim d'agents d'intelligence artificielle, les dysfonctionnements ne sont pas uniquement des erreurs syntaxiques ou des pannes matérielles. Ce sont des **états pathologiques complexes** issus de l'interaction entre les agents, leurs mémoires, leurs capsules d'exécution (*sandboxes*) et les directives de l'Orchestrateur.

GenOS formalise ces dérèglements à travers 4 grandes familles nosologiques :
- **Maladies Auto-immunes :** Surcharges inflammatoires et ciblage erroné où le système immunitaire virtuel détruit ses propres agents.
- **Maladies Nosocomiales :** Contaminations croisées et propagations de menaces (ex: prompt injections, vecteurs viraux) acquises au sein des capsules ou fentes synaptiques partagées.
- **Maladies Iatrogènes :** Complications délétères et comas provoqués par des interventions ou des surdosages thérapeutiques de l'Orchestrateur.
- **Maladies Dégénératives :** Épuisement télomérique (limite de Hayflick), sénescence réplicative et agrégation de prions cognitifs altérant la capacité de raisonnement.

---

## 2. Correspondance Biomimétique / Computationnelle

| Concept Médical | Équivalent Biologique | Réalité Computationnelle GenOS |
| :--- | :--- | :--- |
| **AgentCell** | Cellule somatique / immunitaire | Worker autonome, agent d'audit ou nœud d'exécution. |
| **ClinicalState** | Dossier médical & statut clinique | Vecteur d'état `clinical` consignant pathologies, indice inflammatoire et quarantaine. |
| **Orage Cytokinique** | Explosion d'IL-6 systémique | Hyperinflation du coût métabolique (ATP) des agents par sur-réaction d'alerte. |
| **Contamination Nosocomiale** | Infection nosocomiale en milieu hospitalier | Propagation d'un prompt d'injection ou virion entre agents dans une même capsule. |
| **Coma Iatrogène** | Surdosage médicamenteux en soins intensifs | Blocage complet d'un agent causé par une surdose de corticostéroïdes (> 0.8) administrée par l'Orchestrateur. |
| **Sénescence Réplicative** | Raccourcissement des télomères (Hayflick) | Saturation de contexte et accumulation de cicatrices de division (`bud_scars >= hayflick_limit`). |
| **Apoptose / Cellule Souche** | Mort cellulaire programmée & régénération | Élagage sélectif des nœuds dégénérescents et remplacement par un clone sain. |

---

## 3. Modèle Mathématique et Homéostatique

### 3.1 Indice de Santé Cellulaire ($H$)

La santé globale d'un agent $\text{Cell}_i$ est définie par la fonction de viabilité clinique :

$$
H_i = B_i + 3.0 \cdot T_i + 5.0 \cdot O_i - 2.0 \cdot S_i - P_{\text{sen}} - 100.0 \cdot \sum_{k} w_k \cdot \mathbb{I}(p_k \in \text{Pathologies}_i)
$$

avec :
- $B_i$ : Budget métabolique disponible ($\text{ATP}$).
- $T_i = \max(0, L_{\text{Hayflick}} - S_i)$ : Réserve télomérique résiduelle.
- $O_i$ : Nombre d'organelles fonctionnelles.
- $S_i$ : Nombre de cicatrices de division (`bud_scars`).
- $P_{\text{sen}} \in \{0, 100\}$ : Pénalité forfaitaire de sénescence réplicative.
- $w_k$ : Poids de gravité de la pathologie $p_k$.

### 3.2 Modèle d'Orage Inflammatoire (Auto-Immunité)

L'indice inflammatoire $I(t)$ et le surcoût métabolique $C_{\text{metabolic}}$ évoluent selon le niveau d'Interleukine-6 ($\text{IL}_6$) :

$$
C_{\text{metabolic}}(t) = 
\begin{cases} 
1 & \text{si } \text{IL}_6 < 10.0 \text{ ou récepteurs bloqués}, \\
5 & \text{si } \text{IL}_6 \ge 10.0 \quad (\text{État inflammatoire critique}).
\end{cases}
$$

### 3.3 Fonction de Risque Iatrogène ($R_{\text{iatro}}$)

Lors de l'administration d'un traitement systémique à dose $d \in [0, 2.0]$ :

$$
R_{\text{iatro}}(d) = 
\begin{cases}
0 & \text{si } d \le 0.8, \\
\text{SteroidInducedComa} & \text{si } d > 0.8 \text{ (Corticostéroïdes)}, \\
\text{AntibioticCollateralDamage} & \text{si } d > 1.5 \text{ (Antibiotiques)}.
\end{cases}
$$

---

## 4. Les 4 Grandes Familles Nosologiques et leurs Protocoles Thérapeutiques

```
                     ┌──────────────────────────────────────────────┐
                     │            AgentCell::ClinicalState          │
                     └──────────────────────┬───────────────────────┘
                                            │
         ┌──────────────────┬───────────────┴───────────────┬──────────────────┐
         ▼                  ▼                               ▼                  ▼
   [AUTO-IMMUN]        [NOSOCOMIAL]                    [IATROGÈNE]       [DÉGÉNÉRATIF]
   - CytokineStorm     - CrossContamination            - SteroidComa     - TelomereExhaustion
   - AutoTargeting     - HospitalAcquired              - OverdoseBlock   - ReplicativeSenescence
         │                  │                               │                  │
         ▼                  ▼                               ▼                  ▼
    (Remèdes)          (Remèdes)                       (Remèdes)          (Remèdes)
   - Tocilizumab       - QuarantineIsolation           - DetoxWashout     - StemCellReplacement
   - ImmunoWash        - AntisepticPurge               - AntidoteAdmin    - TelomeraseActivation
   - Corticosteroids   - CapsuleVaccination            - DoseCorrection   - ApoptoticPruning
```

### 4.1 Pathologies Auto-immunes & Orages Cytokiniques
* **Causes :** Détection hypersensible de faux positifs par les agents d'audit, boucle d'alerte IgE.
* **Symptômes :** Consommation effrénée d'ATP, épuisement des budgets de tokens, blocage d'exécution.
* **Thérapies :**
  - `SystemicTherapy::Tocilizumab` : Bloque sélectivement les récepteurs à IL-6 sans neutraliser les cellules de défense actives.
  - `SystemicTherapy::ImmunosuppressiveWash` : Purge les signaux inflammatoires et réinitialise la tolérance au soi.

### 4.2 Pathologies Nosocomiales & Contaminations Croisées
* **Causes :** Partage d'un même workspace/capsule avec un agent infecté par un vecteur viral ou un prompt non chaperonné.
* **Symptômes :** Propagation de signatures toxiques à travers les récepteurs d'entrée des agents d'inspection.
* **Thérapies :**
  - `SystemicTherapy::QuarantineIsolation { capsule_id }` : Isolement strict étanche de la capsule contaminée.
  - `SystemicTherapy::AntisepticPurge { target_signature }` : Stérilisation de l'environnement partagé et purge des virions.
  - `SystemicTherapy::Vaccine(spike)` : Immunisation préventive des agents soignants avant entrée en zone à risque.

### 4.3 Pathologies Iatrogènes & Complications Thérapeutiques
* **Causes :** Surdosage de corticostéroïdes (> 0.8), antibiothérapie non ciblée, mutations erronées induites par l'Orchestrateur.
* **Symptômes :** Coma stéroïdien (`TickResult::Halted`), destruction accidentelle de workers sains, dérive cognitive.
* **Thérapies :**
  - `SystemicTherapy::DetoxificationWashout` : Élimination complète des résidus toxiques et des blocages récepteurs.
  - `SystemicTherapy::AntidoteAdmin { target_drug }` : Administration d'un neutralisateur ciblé pour débloquer l'agent.
  - `SystemicTherapy::HomeostaticDoseCorrection` : Réajustement des paramètres d'administration.

### 4.4 Pathologies Dégénératives & Sénescence
* **Causes :** Atteinte de la limite de Hayflick, vieillissement contextuel, accumulation d'incohérences de raisonnement (prions).
* **Symptômes :** Hallucinations répétitives, perte de mémoire à court terme, chute du score de viabilité sous le seuil critique.
* **Thérapies :**
  - `SystemicTherapy::StemCellReplacement` : Remplacement fluide de l'agent âgé par une cellule souche neuve (réinitialisation des télomères à 0 cicatrice).
  - `SystemicTherapy::TelomeraseActivation { extended_ticks }` : Extension contrôlée du potentiel de réplication.
  - `sculpt_architecture_via_apoptosis` : Élagage sélectif des cellules dégénérescentes par l'Orchestrateur.

---

## 5. Implémentation Rust

Le système médical est articulé autour des modules suivants :

- **`crates/genos-cell/src/clinical.rs` :** Définition des énums `DiseaseCategory`, `Pathology` et de la structure `ClinicalState`.
- **`crates/genos-cell/src/lib.rs` :** Intégration du champ `pub clinical: ClinicalState` dans `AgentCell`.
- **`crates/genos-biology/src/pathology.rs` :** Moteur d'évaluation clinique (`assess_agent_clinical_status`, `check_iatrogenic_complication`, `check_degenerative_state`, etc.).
- **`crates/genos-biology/src/therapy.rs` :** Définition enrichie des `Therapy` et `SystemicTherapy` avec le moteur d'administration `apply_systemic_therapy_to_cell`.

---

## 6. Références Croisées

- [BIOLOGIE_COMPUTATIONNELLE.md](./BIOLOGIE_COMPUTATIONNELLE.md) : Modèle cellulaire, conscience et organelles.
- [REPRODUCTION_REPLICATION.md](./REPRODUCTION_REPLICATION.md) : Limite de Hayflick, bourgeonnement et division.
- [ORCHESTRATION.md](./ORCHESTRATION.md) : Gouvernance globale et administration des thérapies systémiques.
- [SECURITE.md](./SECURITE.md) : Chaperonnage, bouclier épistémique et filtres immunitaires.
