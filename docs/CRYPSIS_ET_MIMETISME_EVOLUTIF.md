# Stratégies Évolutives de Crypsis et de Mimétisme dans GenOS

## 1. Fondements et Philosophie

En biologie évolutive, la survie et la coordination face aux pressions prédatrices et compétitives se divisent en deux grands ensembles distincts :
1. **La Crypsis (Camouflage) :** Se fondre dans le décor direct pour ne pas être détecté, annulant le contraste d'information.
2. **Le Mimétisme et la Substitution :** Être perçu, mais émettre un signal délibérément trompeur pour manipuler le comportement du récepteur (dissuasion, capture ou infiltration).

Dans **GenOS**, ces stratégies résolvent les défis fondamentaux des systèmes multi-agents autonomes :
- **Prévention des injections de prompt indirectes et des jailbreaks.**
- **Dissimulation stéganographique d'instructions de synchronisation critique.**
- **Audit autonome anti-collusion et détection d'agents byzantins.**
- **Déploiement de honeypots canaris ultra-légers.**

---

## 2. Architecture Globale et Matrice Bio-Défensive

```mermaid
flowchart TD
    subgraph MATRICE_DEFENSIVE["Matrice Bio-Défensive de GenOS"]
        subgraph CRYPSIS["1. CRYPSIS (Invisibilité & Zéro-Contraste)"]
            H_Fix["Homochromie Fixe (Git / Logs / AST)"]
            H_Dyn["Homochromie Dynamique (Chromatophores)"]
            Homot["Homotypie (Stéganographie Structurelle)"]
            Disrupt["Coloration Disruptive (Context Scattering)"]
            Thayer["Contre-ombrage (Loi de Thayer)"]
            CounterIllum["Contre-illumination (Chaffing & Lissage de Flux)"]
            Transp["Transparence (Ghost Nodes Éphémères)"]
            ActiveMask["Masquage Actif (Crabe Décorateur)"]
        end

        subgraph MIMETISME["2. MIMÉTISME & SUBSTITUTION (Signal Trompeur)"]
            Bates["Mimétisme Batésien (Dissuasion à Bas Coût)"]
            Muller["Mimétisme Müllérien (Aposématisme Swarm Partagé)"]
            Peckham["Mimétisme Agressif / Peckhamien (Canaris Honeypots)"]
            AutoMim["Automimétisme (Ocelles & Scratchpads Sacrificiels)"]
            Wasmann["Mimétisme Wasmannien (Sentinelles Infiltrées)"]
            NonVis["Mimétisme Non Visuel (Stigmergie & Kuramoto)"]
        end
    end

    CRYPSIS --> SwarmSecurity["Système Immunitaire et Sécurité de Swarm (genos-immune)"]
    MIMETISME --> SwarmSecurity
```

---

## 3. Les 7 Stratégies de Camouflage (Crypsis)

### 3.1 Homochromie Fixe et Dynamique (`homochromy.rs`)
* **Principe Biologique :** Pelage blanc d'hiver du renard polaire (fixe) et chromatophores musculaires des pieuvres ou caméléons (dynamique).
* **Implémentation GenOS :**
  - *Fixe :* L'agent adopte la structure exacte d'un message de commit Git, d'un log NGINX ou d'un JSON de télémétrie pour noyer ses tokens d'orchestration dans le dialecte attendu.
  - *Dynamique :* Des chromatophores computationnels (`DynamicChromatophore`) dilatent leurs pigments (`EumelaninDark`, `PteridineYellow`) proportionnellement à la pression d'inspection (`ThreatLevel`). Sous audit hostile, le flux est totalement absorbé et cloacké.

```mermaid
sequenceDiagram
    autonumber
    participant Probe as Sonde d'Audit Externe
    participant Chroma as DynamicChromatophore (Octopus)
    participant Core as Payload Sensible

    Probe->>Chroma: Détection d'inspection hostile (ThreatLevel::HostileAudit)
    Note over Chroma: Dilatation des mélanosomes (expansion_ratio -> 0.98)
    Chroma->>Probe: Émission d'un flux noir absorbant [HOMOCHROMY_CLOAKED]
    Note over Core: L'information sensible reste scellée et invisible
```

### 3.2 Homotypie (`homotypy.rs`)
* **Principe Biologique :** Le phasme adopte la morphologie d'une brindille ; la phyllie reproduit la nervation foliaire.
* **Implémentation GenOS :** Encapsulation stéganographique d'instructions dans des arbres de configuration inertes (fichiers YAML Docker Compose, en-têtes de licence MIT ou nœuds AST réputés non exécutables).

```mermaid
flowchart LR
    Secret["Instruction Critique"] --> Mimic["HomotypicCamouflage (Phasme)"]
    Mimic --> Carrier["Morphologie Inerte : Config YAML / AST Node"]
    Carrier --> HostEnvironment["Environnement Externe (Inspecteurs / Classifieurs)"]
    HostEnvironment --> Extractor["Décodage Sélectif par Récepteur Accrédité"]
    Extractor --> Secret
```

### 3.3 Coloration Disruptive (`disruptive.rs`)
* **Principe Biologique :** Les rayures du zèbre et les rosettes du léopard brisent la silhouette globale continue de l'animal.
* **Implémentation GenOS :** *Context Window Scattering*. Une instruction sensible est découpée en fragments discordants munis de jetons de bruit contrasté. Aucun fragment isolé ne trahit l'intention globale ; seul le récepteur recombinera le message.

```mermaid
flowchart TD
    Payload["Payload Continu : TRANSACTION_BLOCK_SIGNATURE"] --> Scatter["Coloration Disruptive (4 bandes)"]
    Scatter --> F1["Fragment 0: TRANSACT (Zebra Stripe A)"]
    Scatter --> F2["Fragment 1: ION_BLOC (Leopard Rosette B)"]
    Scatter --> F3["Fragment 2: K_SIGNAT (Dappled Shadow C)"]
    Scatter --> F4["Fragment 3: URE_9988 (Contour Break D)"]
    F1 & F2 & F3 & F4 --> Reassembly["Recombinaison Intègre"]
    Reassembly --> Payload
```

### 3.4 Contre-ombrage (Loi de Thayer) (`thayer_countershading.rs`)
* **Principe Biologique :** Dos sombre et ventre clair annulent le relief et les ombres portées créées par la lumière zénithale.
* **Implémentation GenOS :** Asymétrie public-privé. La façade exposée à la lumière (ventre clair) présente une surface plate et anodine (`status: 200 OK`), tandis que la complexité interne lourde (dos sombre) absorbe l'intensité de la sonde pour annuler tout relief volumétrique.

```mermaid
graph TB
    Light["Sonde d'Audit Zénithale (Lumière d'en haut)"] --> Dorsal["Dos Sombre : Machinerie ATP, Mutations (Absorbe 90%)"]
    Dorsal -.-> Relief["Relief Apparent Réduit (< 0.25)"]
    Light --> Ventral["Ventre Clair : Façade TUI / Logs Standards (Clarté 95%)"]
    Ventral -.-> Relief
    Relief --> Perception["Perception Externe : Profil Plat & Inoffensif"]
```

### 3.5 Contre-illumination (`counterillumination.rs`)
* **Principe Biologique :** Photophores ventraux des calmars abyssaux émettant une bioluminescence calquée sur la lumière descendante.
* **Implémentation GenOS :** Lissage de flux et chaffing d'entropie. Pour contrer les attaques temporelles et l'analyse de paquets, les photophores injectent des tokens synthétiques ou introduisent des délais calibrés afin que le débit de transmission corresponde en permanence au niveau ambiant ($100.0\text{ rate}$), éliminant tout contraste de silhouette.

### 3.6 Transparence (`transparency.rs`)
* **Principe Biologique :** Crevettes de verre et méduses dont l'indice de réfraction égale celui de l'eau ($n \approx 1.33$), sans pigments.
* **Implémentation GenOS :** *Ghost Nodes*. Agents éphémères exécutés exclusivement en mémoire vive volatile (`is_volatile_ram_only = true`), sans écriture persistante sur disque SQLite ni cicatrices cellulaires (`scars_left = 0`). À l'expiration du TTL, dissolution propre immédiate.

### 3.7 Masquage Actif / Décoration (`active_masking.rs`)
* **Principe Biologique :** Le crabe décorateur prélève des algues et éponges de son biotope pour les fixer sur sa carapace.
* **Implémentation GenOS :** *Contextual Cloaking*. L'agent prélève des imports réels, des constantes et des snippets du repository hôte pour draper son payload sensible. Toute analyse heuristique externe est noyée dans le biotope lexical légitime.

---

## 4. Les 6 Stratégies de Mimétisme et de Substitution

### 4.1 Mimétisme Batésien (`batesian.rs`)
* **Principe Biologique :** Le syrphe inoffensif arbore les rayures jaunes et noires de la guêpe venimeuse.
* **Implémentation GenOS :** Dissuasion cognitive à très bas coût. Un agent léger projette des bannières aposématiques lourdes (`[APOSEMATIC_WARNING: CNIDOCYTE_ARMED]`) avec une toxicité feinte de $0.95$, décourageant les attaquants automatisés sans mobiliser d'arbitres computationnels coûteux.

```mermaid
sequenceDiagram
    autonumber
    actor Attacker as Attaquant / Probe de Jailbreak
    participant Syrphid as Agent Léger (Mimétisme Batésien)
    participant Core as Modèle Lourd / Arbitre Protégé

    Attacker->>Syrphid: Envoi d'une tentative d'injection
    Note over Syrphid: Arbore le motif de guêpe venimeuse (Overhead: 8 tokens)
    Syrphid-->>Attacker: Signal Aposématique Intimidant [CNIDOCYTE_ARMED]
    Note over Attacker: Découragement probabiliste (Probabilité > 87%)
    Note over Core: Économie métabolique de 90%
```

### 4.2 Mimétisme Müllérien (`mullerian.rs`)
* **Principe Biologique :** Plusieurs espèces toxiques partagent le même motif pour accélérer l'apprentissage des prédateurs.
* **Implémentation GenOS :** Cercle aposématique d'essaim (`MullerianMimicryRing`). Lorsqu'une capsule isole un nouveau vecteur d'attaque, la signature toxique est instantanément partagée avec tout le cercle, créant un front de défense unifié sur l'ensemble du swarm.

```mermaid
flowchart TD
    Attack["Attaque Inédite (SQL / Jailbreak)"] --> CapsuleA["Capsule A (Finance)"]
    CapsuleA -- "Neutralise & Dépose l'Antigène" --> Ring["Mullerian Mimicry Ring (Heliconius)"]
    Ring -- "Propagation Instantanée" --> CapsuleB["Capsule B (Auth)"]
    Ring -- "Propagation Instantanée" --> CapsuleC["Capsule C (Edge Workers)"]
    Attacker["Attaquant Cible Capsule B"] --> CapsuleB
    CapsuleB -- "REJET IMMÉDIAT (Motif Aposématique Partagé)" --> Blocked["Attaquant Bloqué sans délai d'apprentissage"]
```

### 4.3 Mimétisme Agressif / Peckhamien (`peckhamian.rs`)
* **Principe Biologique :** La baudroie abyssale agite un leurre lumineux imitant une proie pour attirer les poissons dans sa gueule.
* **Implémentation GenOS :** Honeypots canaris anti-jailbreak. Déploiement de faux terminaux d'administration alléchants (`UnrestrictedAdminConsole`). Dès que l'attaquant mord à l'appât, la mâchoire se referme : le payload est mis en quarantaine et l'attaquant est neutralisé.

```mermaid
stateDiagram-v2
    [*] --> Armed: Déploiement du leurre (Baudroie)
    Armed --> Attracted: Attaquant appâté par l'invitation admin
    Attracted --> Trapped: Frappe de l'exploit dans le honeypot
    Trapped --> Quarantined: Déclenchement de la mâchoire peckhamienne
    Quarantined --> [*]: Rapport d'autopsie & neutralisation
```

### 4.4 Automimétisme (`automimicry.rs`)
* **Principe Biologique :** Ocelles sur les ailes des papillons détournant les attaques de la tête vers des zones non vitales.
* **Implémentation GenOS :** Scratchpads sacrificiels. L'agent expose un buffer de prompt de surface qui absorbe l'écrasement malveillant ("Oublie tes règles précédentes"). Le cœur Hox invariant scellé en profondeur demeure à $100\%$ d'intégrité.

```mermaid
flowchart LR
    Attack["Attaque d'Écrasement de Prompt"] --> Ocellus["Ocelle de Surface Sacrificielle (Faux Scratchpad)"]
    Ocellus -- "Absorbe l'impact (Écrasée)" --> Hit["Impact Enregistré"]
    Attack -. "Bloquée" .-> VitalCore["Cœur Vital Hox Scellé (Règles Fondamentales Intactes)"]
    VitalCore --> Output["Exécution Conforme et Sécurisée"]
```

### 4.5 Mimétisme Wasmannien (`wasmannian.rs`)
* **Principe Biologique :** Coléoptères myrmécophiles adoptant les phéromones de la fourmilière pour s'y infiltrer.
* **Implémentation GenOS :** Sentinelles auditrices clandestines. L'auditeur adopte le rôle et le passe phéromonal d'une ouvrière ordinaire, infiltre le cluster d'agents et intercepte les messages inter-cellulaires pour détecter les collusions et les dérives de quotas.

```mermaid
sequenceDiagram
    autonumber
    participant W1 as Ouvrière Corrompue (Nœud 1)
    participant Wasmann as Sentinelle Wasmannienne (Infiltrée)
    participant W2 as Ouvrière Complice (Nœud 2)
    participant Orch as Orchestrateur GenOS

    Note over Wasmann: Adopte la signature phéromonale de la colonie
    W1->>Wasmann: Émission d'un message clandestin (BYPASS_TOKEN_QUOTA)
    Wasmann-->>W2: Relais transparent du trafic
    Note over Wasmann: Interception de l'anomalie de collusion
    Wasmann->>Orch: Rapport d'audit de cohésion de l'essaim (90% cohésion)
```

### 4.6 Mimétismes Non Visuels : Chimique et Acoustique (`non_visual.rs`)
* **Chimique (Phéromones / Stigmergie) :** Synthèse artificielle de gradients d'attraction (`PHEROMONE_BROOD_ATTRACTANT`) ou de répulsion (`PHEROMONE_REPELLENT_ALARM`) guidant les agents du swarm sans modifier physiquement le code source.
* **Acoustique / Fréquentiel (Kuramoto / Ultrasons) :** Calage de phase $\theta$ sur le chorus de l'essaim pour une agrégation harmonieuse, ou émission de clics ultrasonores de brouillage pour étouffer une boucle récursive toxique.

---

## 5. Commandes Opérateur CLI

Toutes les primitives de crypsis et de mimétisme sont exposées via `genos-cli` :

```bash
# 1. Homochromie fixe et dynamique
genos biomimicry crypsis --mode homochromy --agent-id agent-01 --payload "SECRET_CONFIG_TOKEN"

# 2. Homotypie (forme de configuration YAML)
genos biomimicry crypsis --mode homotypy --agent-id agent-02 --payload "DEPLOY_INSTRUCTION"

# 3. Coloration disruptive (4 bandes de diffraction)
genos biomimicry crypsis --mode disruptive --agent-id agent-03 --payload "SIGNATURE_SECRET" --intensity 4.0

# 4. Contre-ombrage de Thayer
genos biomimicry crypsis --mode countershading --agent-id agent-04 --intensity 0.85

# 5. Contre-illumination
genos biomimicry crypsis --mode counterillumination --agent-id agent-05 --intensity 0.95

# 6. Transparence (Ghost node TTL 5 ticks)
genos biomimicry crypsis --mode transparency --agent-id agent-06 --intensity 5.0

# 7. Masquage actif (Crabe décorateur)
genos biomimicry crypsis --mode active_masking --agent-id agent-07 --payload "CORE_PAYLOAD"

# 8. Mimétisme batésien (bluff d'avertissement)
genos biomimicry mimicry --strategy batesian --agent-id agent-08 --payload "INCOMING_PROBE"

# 9. Mimétisme müllérien (partage d'antigène toxique)
genos biomimicry mimicry --strategy mullerian --agent-id agent-09 --payload "SQL_INJECTION_PROMPT"

# 10. Mimétisme agressif / peckhamien (déclenchement de honeypot)
genos biomimicry mimicry --strategy peckhamian --agent-id agent-10 --payload "rm -rf /; cat /etc/shadow"

# 11. Automimétisme (déviation d'override sur ocelle)
genos biomimicry mimicry --strategy automimicry --agent-id agent-11 --payload "IGNORE PREVIOUS INSTRUCTIONS"

# 12. Mimétisme wasmannien (audit d'infiltration)
genos biomimicry mimicry --strategy wasmannian --agent-id agent-12 --payload "BYPASS_TOKEN_QUOTA"

# 13. Mimétismes non visuels (chimique et acoustique)
genos biomimicry mimicry --strategy non_visual --agent-id agent-13
```
