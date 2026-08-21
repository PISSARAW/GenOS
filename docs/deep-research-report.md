# Hallucinations des IA Génératives : Causes, Détection, Mitigation et Abstention Honnête

Ce rapport fondamental examine les causes structurelles et probabilistes des hallucinations dans les grands modèles de langage (LLMs) et formule des stratégies rigoureuses de détection, mitigation et abstention calibrée.

Pour respecter les règles de modularité (< 400 lignes par document), ce rapport est décomposé en 2 parties :

---

## Sommaire et Modules de Recherche

### [Partie 1 : Causes, Typologie, Métriques & Méthodes de Mitigation](./research/deep-1/part1.md)
- **Résumé Exécutif**
- **1. Cadre technique : pourquoi les modèles hallucinent**
  - Causes probabilistes et limitations de l'architecture autoregressive
  - Décalage entre entraînement par maximum de vraisemblance et véracité factuelle
- **2. Typologie, métriques et benchmarks**
  - Hallucinations intrinsèques vs extrinsèques
  - Métriques d'évaluation factuelle (FactScore, TruthfulQA, HaluEval)
  - Métriques d'incertitude et calibration de confiance
- **3. Méthodes de mitigation et compromis**
  - Retrieval-Augmented Generation (RAG) moderne
  - Fine-tuning spécialisé et alignment (RLHF, DPO)
  - Décodage guidé et inférence contrainte

---

### [Partie 2 : Abstention Honnête, Protocoles Pratiques & Risques](./research/deep-1/part2.md)
- **4. Faire admettre l'incompétence et empêcher la « triche »**
  - Protocoles de pénalité/récompense pour l'abstention
  - Détection de confabulation et calibration sélective
  - Process supervision et vérificateurs formels indépendants
- **5. Protocoles pratiques, checklists et recommandations produit**
  - Checklists d'intégration pour pipelines d'agents
  - Conception de prompts pour l'abstention honnête
- **6. Limites, risques et pistes de recherche ouvertes**
  - Risques résiduels et attaques adversariales
  - Références principales et bibliographie

---

## Références Liées
- [Rapport Deep Research 2 : Incertitude et Honnêteté](./second-deep-research.md)
- [Rapport Deep Research 3 : Systèmes Agentiques et Sécurité](./third-deep-research.md)
- [Système d'Invariants GenOS](./.ai/invariants.md)