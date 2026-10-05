# ADR 0284 : Terminologie — Organisme computationnel vs Organisme biologique

## Statut
Accepté

## Date
2026-10-05

## Contexte
Le plan d'architecture (Lot B, étape 6) impose de conserver l'appellation « organisme computationnel » plutôt que « organisme biologique » pour éviter toute confusion ontologique. Le codebase utilise déjà des termes biomimétiques (membrane, métabolisme, sporulation, homéostasie) qui risquent d'être interprétés comme des claims biologiques réels.

## Décision
**Terminologie obligatoire dans tout le codebase, la documentation, les tests et la communication :**

| Concept | Terme officiel | Termes interdits | Justification |
|---------|----------------|------------------|---------------|
| Entité principale | **Organisme computationnel** | Organisme biologique, organisme vivant, vie artificielle | Pas de métabolisme biologique, pas d'ADN, pas d'évolution darwinienne |
| Unité de base | **Cellule agentique** / `AgentCell` | Cellule biologique, neurone | Modèle computationnel, pas substrat biologique |
| Frontière | **Membrane d'autopoïèse** / `Membrane` | Membrane cellulaire, bicouche lipidique | Invariant logiciel, pas structure biophysique |
| Énergie | **Budget ATP** / `Metabolism::energy_level` | ATP, adénosine triphosphate | Jeton comptable, pas molécule chimique |
| Réparation | **Régénération / Thérapie autorisée** | Guérison, cicatrisation, régénération biologique | Opération logique réversible, pas processus physiologique |
| Reproduction | **Division computationnelle / Sporulation** | Division cellulaire, mitose, méiose | Copie d'état + variation génomique, pas réplication biochimique |
| Immunité | **Immunité épistémique / AIS** | Système immunitaire, anticorps, lymphocytes | Détection patterns anomalie, pas reconnaissance antigénique |
| Mort | **Apoptose / Cryptobiose / Fossilisation** | Mort cellulaire, nécrose | Arrêt contrôlé + archivage, pas cessation vie |
| Environnement | **Monde simulé / Niche computationnelle** | Milieu biophysique, écosystème | Espace d'états discret, contraintes algorithmiques |

## Règles d'écriture
1. **Code** : Commentaires et noms de types utilisent la terminologie officielle (ex: `OrganismState::Computational`, pas `Biological`)
2. **Tests** : Noms de tests reflètent la simulation (ex: `test_computational_organism_homeostasis`, pas `test_organism_survival`)
3. **Documentation** : Tout README, ADR, doc utilisateur utilise le vocabulaire contrôlé
4. **Communication externe** : « GenOS simule des dynamiques inspirées de la biologie » — jamais « GenOS crée de la vie artificielle »

## Mécanisme d'enforcement
- **Gate CI** : `scripts/ci/check_code_quality.py` étendu pour détecter les termes interdits dans les commentaires publics, docs, strings user-facing
- **Pre-commit hook** : Rejette les commits introduisant des termes interdits dans fichiers stagés
- **Liste termes surveillés** : `biological organism`, `living organism`, `artificial life`, `real metabolism`, `real cell`, `true immunity`, `healing`, `biological reproduction` (case-insensitive)

## Exceptions documentées
- **Citations** : Guillemets + référence (ex: « "artificial life" au sens de Langton 1989 »)
- **Comparaisons explicites** : « Comportement *analogue à* l'homéostasie biologique » (ADR 0039)
- **Noms de crates/modules historiques** : `genos-biology`, `genos-cell` conservés pour compatibilité ; nouveaux modules suivent la règle

## Conséquences
- Clarifie la nature computationnelle du système pour utilisateurs, auditeurs, régulateurs.
- Protège contre l'anthropomorphisme et les claims non fondés (aligné ADR 0016, 0027, 0134).
- Force la précision technique : on parle de *budget*, *invariant*, *snapshot*, pas de *vie*, *mort*, *guérison*.

## Références
- Plan architecture GenOS V3, Lot B, étape 6
- ADR 0039 (systèmes vitaux agents 6-10)
- ADR 0045 (noyau contrôle morphogenèse)
- ADR 0134 (boucles réflexives = indicateurs, jamais conscience)