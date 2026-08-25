# Régénération — Réparation de Tissus Modulaires

> **Concept biologique** : Régénération tissulaire (ex: Axolotl) — amputation d'un membre lésé, formation d'un blastème, et repousse à l'identique.
> **Statut** : implémenté (`genos-core::biomimicry::regeneration`)
> **Recherche amont** : `docs/research/fr/BIOMIMICRY_REGENERATION.md`

## 1. Pourquoi

### 1.1 Le problème : L'Apoptose est coûteuse
Jusqu'à présent, si une sous-branche de l'arbre cognitif d'un agent était corrompue (ex: la mémoire RAG saturée de fausses informations suite à une attaque d'injection), le protocole par défaut était l'**Apoptose** : on tuait l'agent entier. C'est sécurisé, mais très cher, surtout pour des agents matures (Imago) ayant accumulé un contexte long.

### 1.2 La solution : Amputation et Blastème
La biologie offre une alternative : on "ampute" uniquement le module endommagé (ex: `MemoryModule`), on forme un "blastème" (on remonte au dernier checkpoint sain de ce module précis), et on le régénère pendant que le reste de l'agent continue de fonctionner.

## 2. Comment

Le `RegenerativeBlastema` gère l'état de la cicatrisation :
- **TissueStatus::Healthy** : Le module est sain.
- **TissueStatus::Corrupted** : L'observateur a détecté une anomalie (divergence, échecs répétés, injection).
- **TissueStatus::Regenerating** : Le module est coupé du reste de l'agent. Le système charge le `base_checkpoint_hash`.

## 3. Quand — orchestrateur vs worker

| Acteur | Responsabilité |
|---|---|
| **Observer (Agent de sécurité)** | Détecte la corruption locale et appelle `amputate` sur le module lésé. |
| **Orchestrateur** | Relance la génération de ce module depuis le checkpoint sain, puis appelle `complete`. |
| **Worker** | L'agent continue de vivre sans ce membre (il catch les erreurs `MissingModule` ou utilise un fallback) jusqu'à ce que la régénération soit terminée. |

## 4. API

### 4.1 CLI
```bash
# 1. Amputer la mémoire corrompue
genos biomimicry bio-feature --feature regeneration --action tissue \
  --param module_id=rag_memory_core \
  --param regenerate_action=amputate \
  --param base_checkpoint_hash=sha256_sain_123

# 2. Une fois reconstruit, compléter
genos biomimicry bio-feature --feature regeneration --action tissue \
  --param module_id=rag_memory_core \
  --param regenerate_action=complete \
  --param base_checkpoint_hash=sha256_sain_123
```
