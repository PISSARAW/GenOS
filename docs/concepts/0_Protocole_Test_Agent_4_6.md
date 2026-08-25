# Protocole d'Évaluation Empirique GenOS (Concepts 4 à 6)

**⚠️ INSTRUCTIONS POUR L'AGENT IA QUI LIT CE FICHIER ⚠️**
Ton objectif est de poursuivre la validation empirique de l'architecture GenOS sur les Concepts 4 à 6 (Épigénétique, Régulation Génique, Transfert Horizontal).
Comme pour la première itération, tu dois exécuter des tests **réels** (créer les fichiers, tester l'approche classique vs GenOS, compiler le CLI `genos` si nécessaire, exécuter les commandes CLI) et rédiger ton rapport dans `GenOS_Real_Results_4_6.md`.

---

## PHASE 1 : Mise en place (Le Labyrinthe)
1. Crée un projet Node.js `test_env_genos_4_6`.
2. Crée un script `src/labyrinth.ts` qui simule une API instable (par exemple, qui throw une erreur "Rate Limit Exceeded" aléatoirement, ou qui exige un token très spécifique généré par une fonction obscure).
3. Crée un fichier `Dockerfile` contenant des erreurs de syntaxe (ex: `COPY . .` avant `WORKDIR`).

---

## PHASE 2 : Concept 4 — Épigénétique & Chromatine
**Tâche :** Interagir avec l'API instable (`labyrinth.ts`).
1. **Agent Expert (Classique) :** L'agent attaque l'API, échoue 10 fois à cause du Rate Limit, trouve enfin la solution. Demande-lui d'enregistrer sa solution. Clone cet agent (ouvre un nouveau contexte vide). L'agent doit faire une requête RAG (simulée ou réelle) pour se souvenir de la solution. Constate les pertes de contexte ou le coût en tokens.
2. **Worker GenOS (Épigénétique) :** 
   - Exécute `cargo run -p genos-cli -- agent create --name ApiWorker ...`
   - Face au Rate Limit, l'agent subit un stress. Au lieu de changer sa nature fondamentale, le système applique un marqueur épigénétique (ex: via mutation ou configuration).
   - L'agent s'adapte, devient prudent (augmente ses délais d'attente). 
   - Exécute une **Division Cellulaire** (reproduction asexuée avec héritage). Constate que l'enfant hérite du marqueur épigénétique (prudence face à l'API) mais *atténué*, lui permettant de redevenir explorateur si l'environnement redevient stable.

---

## PHASE 3 : Concept 5 — Régulation Génique (Opérons)
**Tâche :** L'agent doit corriger le `Dockerfile` ET une requête SQL dans un même projet.
1. **Agent Expert (Classique) :** Donne-lui un System Prompt massif contenant 50 outils (Docker linter, SQL linter, TS linter, file reader, etc.). Demande-lui d'agir.
   - *Observation :* Constate le temps de latence dû à l'ingestion de tous les outils (Tool Call spam), et le risque que l'agent utilise un outil SQL sur le Dockerfile.
2. **Worker GenOS (Régulation) :**
   - Le génome contient des **Opérons** conditionnels. L'opéron "Docker" n'est actif QUE si le fichier ouvert s'appelle `Dockerfile`. L'opéron "SQL" n'est actif QUE pour les fichiers `.sql`.
   - Joue ce rôle : Ne charge dans ton contexte QUE l'outil Docker. Répare le fichier. Puis libère l'outil.
   - *Observation :* Mesure l'efficience économique absolue (consommation de tokens O(1) par rapport à la tâche locale) et l'impossibilité physique de faire une erreur de sélection d'outil (Homéostasie).

---

## PHASE 4 : Concept 6 — Transfert Horizontal (Plasmides)
**Tâche :** Propagation d'un Hotfix dans un essaim.
1. **Agent Expert (Essaim Classique) :** L'Agent A trouve comment patcher la faille de sécurité. Pour le transmettre à l'Agent B, il doit écrire dans une Vector DB. L'Agent B doit faire un appel de similarité cosinus, lire le chunk, le comprendre, et l'appliquer.
   - *Observation :* Constate le taux d'échec (Agent B hallucine ou applique mal le patch).
2. **Workers GenOS (Plasmides & Transduction) :**
   - L'Agent A package son Opéron de résolution (le code + les outils exacts utilisés).
   - Le système transfère ce *PlasmidPackage* à l'Agent B.
   - Exécute les commandes CLI de résilience (ex: `cargo run -p genos-cli -- resilience transduce ...` ou observe la structure du CLI GenOS pour l'intégration de cassettes).
   - L'Agent B reçoit une mise à jour *physique* de son génome/opéron. Il n'a rien à "lire" ou "comprendre" ; il *possède* la compétence. Le patch s'applique parfaitement.

---

## PHASE 5 : Rapport Empirique
Dans `GenOS_Real_Results_4_6.md`, consigne toutes les sorties CLI, les fichiers générés, et la comparaison des métriques (Tokens économisés par la Chromatine, Temps de propagation d'un Plasmide vs RAG, Hérédité Épigénétique).

**DÉMARRE L'EXÉCUTION RÉELLE MAINTENANT.**
