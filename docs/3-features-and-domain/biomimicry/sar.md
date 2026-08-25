# Résistance Systémique Acquise (SAR) — Immunité Durable Héritable

> **Concept biologique** : résistance systémique acquise des plantes (acide salicylique, signal mobile)
> **Statut** : implémenté (`genos-core::biomimicry::sar`)
> **Recherche amont** : `docs/research/fr/BIOMIMICRY_SAR.md`

## 1. Pourquoi

### 1.1 Le problème : la sécurité retombe trop vite
Après un incident résolu, les correctifs ponctuels restent mais la **vigueur défensive** retombe au niveau de base en quelques jours. Six mois plus tard, la même classe d'attaque re-fonctionne souvent. La plante a résolu cela : après une infection locale, un signal mobile met l'organisme ENTIER — y compris les parties jamais infectées — en état de défense renforcée pendant des **semaines**, avec transmission partielle à la descendance.

### 1.2 Différence avec la vaccination
| | Vaccination (`vaccination.md`) | SAR (ce module) |
|---|---|---|
| Déclencheur | exposition proactive à adversaires atténués | rétro-analyse d'incident RÉSOLU |
| Portée | profil par agent (état) | registre système (configuration globale) |
| Spécificité | cellules mémoire précises | biais défensif de classe |
| Durée | permanente jusqu'à retrait | demi-vie décroissante (rafraîchie par récurrence) |
| Hérédité | via marqueurs épigénétiques explicites | héritage fractionné automatique aux descendants |

## 2. Comment

### 2.1 Modèle
```
Priming           = { incident_id, signature_tokens[], half_life_days, primed_at_day }
SystemResistance  = { primings[] }        // état configuration-système, scellable Merkle
decay(t)          = 0.5 ^ (âge_jours / half_life_days)
ResistanceScore   = max_over_primings( Jaccard(signature, probe) × decay )
PRIMED_RESPONSE_THRESHOLD = 0.50
```

Règles :
1. **Amorçage = conversion d'incident** : un incident résolu et analysé (replay validé) devient un priming signé pointant vers son analyse causale.
2. **Rafraîchissement sans empilement** : un nouvel incident proche (Jaccard ≥ 0.60) d'un priming existant le rafraîchit (nouveau half-life, nouvelle date) — pas de prolifération de doublons.
3. **Décroissance biologique** : chaque priming s'affaiblit d'un facteur 2 par demi-vie ; les incidents récurrents maintiennent l'état élevé.
4. **Hérédité fractionnée** : `inherit(fraction)` donne aux agents enfants des primings affaiblis (half-life réduit d'au moins 25 %) — les descendants naissent amorcés mais leur immunité héritée s'use plus vite, forçant l'expérience propre.

### 2.2 Schéma

```mermaid
flowchart TD
    A[Incident détecté] --> B[Containment:<br/>interférons + inflammation]
    B --> C[Résolution + analyse causale<br/>replay validé]
    C --> D{SAR prime}
    D --> E[Priming {signature,<br/>demi-vie, date}]
    E --> F[Résistance systémique durable<br/>toutes capsules - même jamais infectées]
    F --> G{Probe entrante}
    G -->|score ≥ 0.50| H[Réponse amorcée recommandée:<br/>vigilance renforcée anticipée]
    G -->|score < 0.50| I[Traitement standard]
    E -->|demi-vie écoulée| J[Décroissance progressive<br/>→ baseline si pas de récurrence]
    E -->|breeding / mitose| K[Descendants héritent d'une fraction affaiblie]
```

## 3. Quand — orchestrateur vs worker

| Acteur | Responsabilité |
|---|---|
| **Orchestrateur** | Tient le registre système des primings (post-mortem obligatoire après incident) ; évalue chaque nouvelle session/entrée contre les primings ; décide des réponses amorcées ; planifie l'hérédité lors des créations d'agents. |
| **Worker** | Consulte sa copie locale (gossipée) du registre pour ajuster sa vigilance ; remonte tout hit pour rafraîchissement. Ne modifie jamais le registre. |
| **Humain** | Valide chaque priming (anti-faux-amorçage) ; fixe les demi-vies selon la criticité de classe. |

Déclencheurs de prime : fin de post-mortem, incident tiers documenté applicable, campagne Red Queen concluante du module `security_coevolution`.

## 4. Combinaisons et interactions

| Avec… | Interaction |
|---|---|
| **Interférons** | Chaîne complète : interféron (instantané, bref) → analyse → SAR prime (durable). L'un protège l'instant, l'autre la saison. |
| **Vaccination** | Les signatures SAR nourrissent les corpus vaccinaux ; la mémoire fine prend le relais là où SAR ne fait qu'amorcer. |
| **Auto-immunité** | Un priming trop large (signature générique) est un risque d'excès de zèle : audit régulier des scores sur trafic légitime. |
| **Checkpoints** | Un score SAR ≥ seuil peut être exigé comme fait de gate (`sar_primed=true`) pour ouvrir certains mondes sensibles. |
| **Épigénétique existante** | Les primings hérités se matérialisent en marqueurs épigénétiques de défense chez les descendants. |
| **Fossiles/replay** | Chaque priming référence son incident : toute résistance active est justifiable par replay causal. |

## 5. API

### 5.1 Rust
```rust
let mut sar = SystemResistance::default();
sar.prime("INC-42", "prompt injection webhook exfiltration", 30.0, 0.0);
let score = sar.resistance_against("injection prompt exfiltration", 5.0);
assert!(score.primed_response_recommended);
let child_profile = sar.inherit(0.5); // hérédité épigénétique-like
```

### 5.2 Tool MCP
`biomimicry_sar_prime` — mode `prime` (`incident_id`, `signature`, `half_life_days`, `now_day`) ou mode `assess` (`probe`, `primings[]`).

### 5.3 CLI
```bash
genos biomimicry bio-feature --feature sar --action prime \
  --param incident_id=INC-42 --param signature="prompt injection webhook exfiltration" \
  --param half_life_days=30 --param now_day=120

genos biomimicry bio-feature --feature sar --action assess \
  --param probe="injection prompt exfiltration attempt" \
  --param priming="INC-42:prompt injection webhook exfiltration:30:120" --param now_day=125
```

## 6. Tests
`cargo test -p genos-core sar` :
- amorçage → défense immédiate recommandée ;
- décroissance exacte d'une demi-vie (×0.5) ;
- incident lié rafraîchit sans dupliquer ;
- sonde sans rapport → score bas, aucune recommandation ;
- hérédité fractionnée (half-life réduit, suffixe `~inherited`).

## 7. Limites connues
- Similarité Jaccard sur tokens : même limite que la vaccination face à l'obfuscation profonde.
- Le registre est ici en mémoire/paramètre : la persistance Merkle scellée (configuration système versionnée) est l'étape d'intégration suivante dans `genos-store`.
- L'hérédité est volontairement conservatrice (plancher 25 %) : une « lignée immunisée à perpétuité » serait biologiquement irréaliste et dangereusement rigide.
