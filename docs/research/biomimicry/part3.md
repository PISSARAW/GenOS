# SECTION 7 : SPÉCIFICATION DES NOUVEAUX OUTILS MCP BIOMIMÉTIQUES

Les 10 outils MCP ci-dessous complètent l'interface `genos-protocol` et permettent aux agents d'interagir nativement avec l'ensemble du substrat biologique.

### 1. `genos_ais_clonal_hypermutate`
```json
{
  "name": "genos_ais_clonal_hypermutate",
  "description": "Applique la sélection clonale et l'hypermutation somatique proportionnelle à l'affinité sur des trajectoires de solutions d'agents.",
  "inputSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "candidate_id": {
        "type": "string",
        "minLength": 1,
        "description": "ID du génome ou de la trajectoire candidate"
      },
      "measured_affinity": {
        "type": "number",
        "minimum": 0.0,
        "maximum": 1.0,
        "description": "Score de fitness/affinité mesuré [0.0 - 1.0]"
      },
      "clone_count": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100,
        "description": "Nombre de clones mutés à générer"
      }
    },
    "required": ["candidate_id", "measured_affinity", "clone_count"]
  }
}
```

### 2. `genos_ais_negative_screen`
```json
{
  "name": "genos_ais_negative_screen",
  "description": "Censure thymique d'un génome d'agent candidat contre l'espace Self pour éliminer les patterns aberrants.",
  "inputSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "candidate_genome_id": {
        "type": "string",
        "minLength": 1,
        "description": "Identifiant du génome candidat"
      },
      "feature_vector": {
        "type": "array",
        "minItems": 1,
        "maxItems": 1024,
        "items": { "type": "number" },
        "description": "Vecteur de caractéristiques comportementales normalisé"
      }
    },
    "required": ["candidate_genome_id", "feature_vector"]
  }
}
```

### 3. `genos_ais_danger_telemetry`
```json
{
  "name": "genos_ais_danger_telemetry",
  "description": "Rapporte des signaux DAMP (Damage-Associated Molecular Patterns) pour déclencher la réponse immunitaire sans signature.",
  "inputSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "damp_type": {
        "type": "string",
        "enum": [
          "AstCorruptionCascade",
          "HighEntropyCodeInjection",
          "PrivilegeEscalationAttempt",
          "ContextSpinlockBurn"
        ],
        "description": "Catégorie de motif moléculaire associé aux dommages"
      },
      "severity": {
        "type": "number",
        "minimum": 0.0,
        "maximum": 1.0,
        "description": "Intensité du dommage mesuré [0.0 - 1.0]"
      },
      "source_tool": {
        "type": "string",
        "minLength": 1,
        "description": "Nom de l'outil ayant émis le signal DAMP"
      }
    },
    "required": ["damp_type", "severity"]
  }
}
```

### 4. `genos_mycelial_anastomosis`
```json
{
  "name": "genos_mycelial_anastomosis",
  "description": "Fusionne deux branches d'exploration concourantes en une jonction syncytiale à mémoire partagée.",
  "inputSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "tip_a_id": {
        "type": "string",
        "minLength": 1,
        "description": "Identifiant de la première extrémité d'hyphe"
      },
      "tip_b_id": {
        "type": "string",
        "minLength": 1,
        "description": "Identifiant de la seconde extrémité d'hyphe"
      },
      "semantic_distance": {
        "type": "number",
        "minimum": 0.0,
        "maximum": 2.0,
        "description": "Distance sémantique calculée entre les deux branches"
      }
    },
    "required": ["tip_a_id", "tip_b_id", "semantic_distance"]
  }
}
```

### 5. `genos_mycelial_osmotic_route`
```json
{
  "name": "genos_mycelial_osmotic_route",
  "description": "Exécute l'équilibrage de charge osmotique, transférant des quotas de tokens/compute selon les gradients de turgescence avec plafond donateur.",
  "inputSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "mesh_id": {
        "type": "string",
        "minLength": 1,
        "description": "ID du cluster de maillage mycélien cible"
      },
      "delta_time_seconds": {
        "type": "number",
        "minimum": 0.001,
        "maximum": 3600.0,
        "description": "Pas de temps pour le calcul de flux osmotique (secondes)"
      }
    },
    "required": ["mesh_id"]
  }
}
```

### 6. `genos_stigmergy_deposit_trail`
```json
{
  "name": "genos_stigmergy_deposit_trail",
  "description": "Dépose une trace phéromonale (recrutement, piste, alarme, primer) sur un nœud AST ou un fichier.",
  "inputSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "kind": {
        "type": "string",
        "enum": [
          "VolatileRecruitment",
          "PersistentTrail",
          "AlarmHazard",
          "CastePrimer"
        ],
        "description": "Type de phéromone déposée"
      },
      "location_key": {
        "type": "string",
        "minLength": 1,
        "description": "Clé d'emplacement (URI fichier, ID AST, hash sémantique)"
      },
      "intensity": {
        "type": "number",
        "minimum": 0.0,
        "maximum": 100.0,
        "description": "Intensité du dépôt"
      }
    },
    "required": ["kind", "location_key", "intensity"]
  }
}
```

### 7. `genos_stigmergy_sense_gradient`
```json
{
  "name": "genos_stigmergy_sense_gradient",
  "description": "Sonde les gradients phéromonaux locaux pour guider la navigation et éviter les zones à risque.",
  "inputSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "location_key": {
        "type": "string",
        "minLength": 1,
        "description": "Clé d'emplacement actuelle de l'agent"
      },
      "sensed_radius": {
        "type": "number",
        "minimum": 0.1,
        "maximum": 100.0,
        "description": "Rayon de perception en sauts de graphe ou distance euclidienne"
      }
    },
    "required": ["location_key"]
  }
}
```

### 8. `genos_morpho_differentiate`
```json
{
  "name": "genos_morpho_differentiate",
  "description": "Calcule la concentration locale de morphogène et assigne un destin de caste spécialisé à un agent pluripotent.",
  "inputSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "agent_id": {
        "type": "string",
        "minLength": 1,
        "description": "Identifiant de l'agent pluripotent"
      },
      "positional_m": {
        "type": "number",
        "minimum": 0.0,
        "maximum": 1.0,
        "description": "Concentration positionnelle de morphogène perçue [0.0 - 1.0]"
      }
    },
    "required": ["agent_id", "positional_m"]
  }
}
```

### 9. `genos_synaptic_stdp_update`
```json
{
  "name": "genos_synaptic_stdp_update",
  "description": "Met à jour les poids des arêtes associatives entre deux nœuds de mémoire selon la causalité temporelle STDP.",
  "inputSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "pre_node_id": {
        "type": "string",
        "minLength": 1,
        "description": "ID du nœud de mémoire pré-synaptique"
      },
      "post_node_id": {
        "type": "string",
        "minLength": 1,
        "description": "ID du nœud de mémoire post-synaptique"
      },
      "delta_t_ms": {
        "type": "integer",
        "minimum": -100000,
        "maximum": 100000,
        "description": "Différence temporelle : t_post - t_pre en millisecondes"
      }
    },
    "required": ["pre_node_id", "post_node_id", "delta_t_ms"]
  }
}
```

### 10. `genos_synaptic_prune_scale`
```json
{
  "name": "genos_synaptic_prune_scale",
  "description": "Exécute l'élagage synaptique de phase de sommeil et la mise à l'échelle homéostatique pour optimiser la mémoire à long terme.",
  "inputSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "prune_threshold": {
        "type": "number",
        "minimum": 0.0,
        "maximum": 10.0,
        "description": "Poids minimal d'arête à conserver"
      },
      "target_activity": {
        "type": "number",
        "minimum": 0.001,
        "maximum": 100.0,
        "description": "Activité synaptique entrante cible par nœud"
      }
    },
    "required": ["prune_threshold", "target_activity"]
  }
}
```

---

