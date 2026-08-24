# Hallucinations, Incertitude et Honnêteté des IA Génératives : État de l’Art, Méthodes de Mitigation et Cartographie des Projets

Ce rapport de recherche approfondie traite des défis de calibration, de détection de l'incertitude épistémique, de mitigation des hallucinations et des protocoles d'abstention honnête dans les agents intelligents.

Pour respecter les standards de modularité et la règle de concision (< 400 lignes par document), ce rapport est décomposé en 2 parties :

---

## Sommaire et Modules de Recherche

### [Partie 1 : Étiologie, Réduction des Hallucinations & Abstention Honnête](../deep-2/part1.md)
- **Executive Summary**
- **1. Ce que l’on sait sur les hallucinations et pourquoi elles persistent**
  - Distinctions épistémiques : hallucination vs mensonge vs confabulation
  - « Je ne sais pas » comme problème de décision sous incertitude
  - Formes de triche, dérive d'objectifs et contournement de règles
- **2. Méthodes efficaces pour réduire les hallucinations**
  - RAG Moderne et ancrage contextuel
  - Vérification atomique des assertions (Atomic Fact-Checking)
  - Self-check, vérification itérative et échantillonnage de cohérence
  - Incertitude et calibration de confiance
  - Vérification déterministe par AST et environnements sandbox
- **3. Faire admettre l'incompétence à l'IA et empêcher la triche**
  - Calibration des récompenses pour l'abstention
  - Entraînement sur des questions impossibles et benchmarks adversariaux
  - Découplage confiance, preuve et capacité
  - Process supervision et supervision indépendante hors de portée de l'agent

---

### [Partie 2 : Cartographie, Architecture d'Implémentation & Roadmap](../deep-2/part2.md)
- **4. Cartographie des projets académiques, industriels et open source**
  - Frameworks de vérification et d'abstention
  - Benchmarks d'évaluation de calibration
- **5. Architecture d’implémentation, métriques, coûts et roadmap**
  - Couche de base : preuves avant réponses
  - Couche de vérification et consensus
  - Couche d’abstention calibrée
  - Couche agents, évaluation et observabilité
  - Ordres de grandeur des coûts d'inférence et d'évaluation
  - Timeline de l'évolution du domaine

---

## Références Liées
- [Rapport Deep Research 1 : Causes et Métriques d'Hallucination](./deep-research-report.md)
- [Politique de Mise à Jour de la Documentation](../../.ai/doc-update-policy.md)
- [Invariants Système](../../.ai/invariants.md)