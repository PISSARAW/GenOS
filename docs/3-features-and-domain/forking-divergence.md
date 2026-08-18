# Détection de Divergence et "Forking" de Trajectoires

L'un des défis les plus fascinants de l'ingénierie des agents IA est le rejeu (Replay). Lorsque vous demandez à un système de rejouer une trajectoire passée, il arrive que la "réalité rejouée" se sépare de la "réalité originale". Cela s'appelle une Divergence.

Cette divergence peut être :
- **Intentionnelle** : Vous avez modifié un hyperparamètre ou le prompt système, et vous voulez que l'IA prenne un chemin différent pour voir si le résultat est meilleur.
- **Non-intentionnelle (Bruit)** : Le non-déterminisme de l'API (variation du GPU côté fournisseur) ou une hallucination subtile fait que l'IA prend une décision légèrement différente.

## 1. La Détection de la Divergence
Le système ne peut pas se contenter d'attendre la fin du processus pour dire "ça n'a pas marché". La divergence doit être détectée en temps réel.

### Les mécanismes de détection (Runtime Checks) :
1. **Fingerprinting d'État (Hash State Matching)** : À chaque étape $T$ du rejeu, le système compare le hash cryptographique de l'état du monde (fichiers, base de données) avec le hash stocké lors de la trajectoire originale. S'il y a un décalage d'un seul bit, une divergence est signalée.
2. **Évaluation des Croyances (Belief Signature Diffing)** : Si l'état du monde est identique, mais que la logique interne de l'agent a changé (ses "thoughts" ou "beliefs"), le système détecte une divergence cognitive (grâce à des métriques sémantiques ou via `genos_analyze_trajectory`).
3. **Violation de Contrat** : Si l'appel d'outil à l'étape 3 génère des arguments qui ne correspondent pas au schéma JSON validé lors de la première exécution.

## 2. Le "Forking" : Création de Réalités Alternatives
Que doit faire le système lorsqu'il détecte cette divergence ? C'est ici qu'intervient le concept puissant de Forking (comme un git fork ou un multivers).

### A. Si la divergence est NON-INTENTIONNELLE (Bruit)
- **Alerte & Suspension** : Le système interrompt immédiatement l'agent.
- **Tentative de Correction (Self-Healing)** : Le système de rejeu utilise le "Golden Dataset" de la première exécution pour forcer l'agent à reprendre le bon chemin (en injectant manuellement la bonne réponse pour cette étape spécifique).
- **Si échec, Escalade** : Si la correction échoue, on déclenche le "Safest Revert Point" pour ne pas corrompre l'environnement.

### B. Si la divergence est INTENTIONNELLE (Expérimentation)
C'est le scénario idéal pour les tests A/B ou la résolution de bugs avec des outils comme `genos_causal_replay_experiment`.

1. **L'Instant du Fork** : Au moment précis où la divergence est détectée (ex: à l'étape 4, l'agent choisit d'utiliser la librairie B au lieu de la librairie A), le système invoque `genos_fork`.
2. **Branches Parallèles** : L'exécution originale (Branche A) est mise en "lecture seule" (Snapshot). L'agent continue d'explorer son nouveau raisonnement dans un "monde" totalement isolé (Branche B).
3. **Évaluation (Trajectory Evaluation)** : L'agent termine son travail sur la Branche B.
4. **Le "Merge" Décisif** : Le moteur de Diffing compare le résultat de la Branche A et de la Branche B (`genos_diff`).
   - Si la Branche B (la nouvelle réalité) réussit tous les tests et apporte une meilleure solution, le développeur humain (ou un Agent Critique) déclenche `genos_merge`.
   - La nouvelle réalité écrase l'ancienne et devient la nouvelle "Golden Trajectory".

> [!TIP]
> **En architecture logicielle**  
> Le Forking de trajectoire IA est ce qui permet de faire de la "Science des Données Causalement Isolée". Vous pouvez prouver mathématiquement que *"Si j'avais donné ce prompt spécifique à l'étape 4, l'IA n'aurait jamais effacé ma base de données à l'étape 10"*, car vous avez forké la réalité pour tester cette hypothèse sans risque.
