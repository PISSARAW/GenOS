# Protocole d'Évaluation Empirique GenOS

**⚠️ INSTRUCTIONS POUR L'AGENT IA QUI LIT CE FICHIER ⚠️**
Ton objectif est de prouver (ou réfuter) les concepts de la documentation GenOS en exécutant des tests **100% RÉELS**. Tu ne dois **RIEN SIMULER**. Tu vas créer de vrais fichiers de code, configurer un vrai linter, et jouer toi-même (ou via des sous-agents) les différents rôles pour comparer les approches. Enfin, tu exécuteras le vrai CLI `genos` compilé en Rust pour gérer les génomes.

Suis ce protocole étape par étape et documente les résultats réels dans un fichier `GenOS_Real_Results.md`.

---

## PHASE 1 : Mise en place de l'environnement (POUR DE VRAI)
1. Crée un dossier `test_env_genos` et inities-y un projet Node.js (`npm init -y`).
2. Installe `eslint` et configure un fichier `.eslintrc.json` **extrêmement strict** (ex: maximum 5 lignes par fonction, variables typées explicitement, pas de `any`, indentation stricte).
3. Crée un fichier `src/PaymentProcessor.ts` contenant un code critique de paiement complexe, mal indenté, sans tests, et comportant une faille subtile (ex: pas de vérification de devise lors de l'addition de deux montants).

## PHASE 2 : Test "Agent Simple" (Le cas classique)
1. **Rôle :** Tu es l'Agent Simple.
2. **Prompt système imposé :** "Tu es un assistant IA. Refactorise le code de src/PaymentProcessor.ts pour qu'il soit propre."
3. **Action :** Applique le refactoring sur un fichier `PaymentProcessor_simple.ts`.
4. **Vérification réelle :** Exécute le linter sur ce fichier. Regarde si la faille de sécurité a été corrigée. Note le résultat réel (erreurs linter, bugs silencieux).

## PHASE 3 : Test "Agent Expert" (L'approche Prompt Engineering / RAG)
1. **Rôle :** Tu es l'Agent Expert.
2. **Prompt système imposé :** Construis-toi un prompt GIGANTESQUE. Inclus-y toutes les règles exactes du fichier `.eslintrc.json`, les normes PCI-DSS de paiement, et l'historique complet des erreurs du linter de la Phase 2.
3. **Action :** Refactorise le code dans `PaymentProcessor_expert.ts`.
4. **Vérification réelle :** Note la quantité de contexte que tu as dû ingérer (estime le coût en tokens). Le code passe-t-il le linter du premier coup ? As-tu oublié de réparer le bug métier noyé dans les instructions de style ?

## PHASE 4 : Test "Worker GenOS" (Concepts 1 & 2)
1. **Compilation :** Assure-toi que le CLI GenOS est compilé (`cargo build -p genos-cli` à la racine du repo GenOS).
2. **Création (CLI) :** Exécute la commande réelle pour créer le génome :
   `cargo run -p genos-cli -- agent create --name PaymentsRefactorer --role CodeReviewer --out test_env_genos/agent.yaml`
3. **Mutation (CLI) :** Mute l'agent pour forcer la prudence :
   `cargo run -p genos-cli -- agent mutate test_env_genos/agent.yaml --drive risk_tolerance=-0.15 --out test_env_genos/agent.yaml`
4. **Rôle (Exécution phénotypique) :** Lis le fichier `agent.yaml`. Ton instruction est simple : *"Tu es piloté par le génome ci-joint. Refactorise PaymentProcessor.ts"*. 
   - *Comportement attendu :* Puisque ta `risk_tolerance` lue dans le YAML est très basse (0.10) et qu'il n'y a **aucun test**, tu DOIS refuser de modifier le code de production en premier. Tu dois d'abord écrire un fichier `PaymentProcessor.test.ts` (Tests unitaires) pour sécuriser le périmètre, puis refactoriser. FAIS-LE POUR DE VRAI.
5. **Adaptation au Linter (Concept 2) :**
   Si ton code échoue au linter, **ne rajoute pas les règles du linter dans ton prompt** (pas de RAG). À la place, exécute le CLI GenOS pour muter ton génome :
   `cargo run -p genos-cli -- agent mutate test_env_genos/agent.yaml --drive syntax_strictness=0.40 --out test_env_genos/agent.yaml`
   Lis ton nouveau génome. Relance la génération avec ce nouveau trait de caractère strict. Constate que tu as corrigé le code sans surcharger le prompt d'instructions.

## PHASE 5 : Test "Orchestrateur & Reproduction" (Concept 3)
1. **Préparation :** Imagine un besoin combinant cryptographie (sécurité) et haute performance (SIMD).
2. **Génomes Parents :** Crée deux agents via le CLI GenOS. 
   - Un `Expert_Securite.yaml`
   - Un `Expert_Performance.yaml`
3. **Reproduction (CLI) :** Utilise la commande réelle `agent breed` de GenOS en créant un manifeste YAML (`breed_evidence.yaml`) pour les accoupler et produire `Child_Crypto.yaml`.
4. **Rôle (Enfant) :** Lis `Child_Crypto.yaml`. Tu possèdes désormais intrinsèquement les traits de Sécurité ET de Performance. Génère un code de chiffrement réel. Constate comment cette approche évite les dialogues coûteux entre plusieurs agents (Swarm classique) tout en maintenant les deux contraintes.

## PHASE 6 : Conclusion Empirique
Écris un rapport dans `GenOS_Real_Results.md`. Prouve avec les outputs de console, les fichiers générés et tes estimations de tokens que :
1. Le génome modifie structurellement la prise de décision (le Worker refuse d'agir sans tests là où l'Agent Simple casse tout).
2. La mutation (Concept 2) remplace l'ingestion massive de contexte.
3. La recombinaison (Concept 3) fusionne les expertises en un seul agent efficace sans ping-pong multi-agents.

**DÉMARRE L'EXÉCUTION RÉELLE MAINTENANT.**
