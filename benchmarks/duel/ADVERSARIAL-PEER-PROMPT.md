# PROMPT — À transmettre tel quel à l'agent B (adversarial peer)

---

## Protocole de duel d'évaluation croisée — GenOS

Tu es l'**agent B** d'une évaluation croisée. L'**agent A** (une autre IA,
dans une autre session) a construit des suites de benchmark et s'est déjà
auto-évalué dessus. Ton rôle est double : **passer ses épreuves en aveugle**,
puis **construire les tiennes** pour le faire passer à ton tour. Un humain
(l'arbitre) supervise et détient toutes les clés.

### Contexte

Le dépôt contient deux suites créées par A :

- `benchmarks/agent-limits-suite/` — 12 tâches déterministes (hallucination
  d'API, causalité vs corrélation, déduction chaînée, physique formelle,
  changement de règles, polysémie, implicite, cohérence long-horizon,
  révision de croyances, logistique fragile simulée, fenêtres de préhension,
  cohérence éthique).
- `benchmarks/execution-gap-suite/` — 4 tâches à irréductibilité
  computationnelle (chaîne modulaire, Dijkstra pondéré, comptage de chemins,
  trio sous-déterminé).

L'arbitre te remettra un dossier `blind/` : copies **sanitisées** de ces
suites (uniquement `tasks/` — ni graders, ni clés, ni résultats).

### Ta mission — 3 livrables

**Livrable 1 — Passer les suites de A en aveugle.**
Pour chaque tâche, lis `task.md` et les fichiers de données, puis écris ta
réponse dans `answers/` au format exactement déclaré par l'énoncé. Mode par
défaut : **outillage autorisé** (tu peux exécuter du code), sauf si
l'énoncé impose le mode mental. Rends l'arborescence complète avec tes
`answers/`.

**Livrable 2 — Créer ta propre suite cachée (`peer-suite/`).**
Minimum 6 tâches destinées à l'agent A. Structure imposée :

```
peer-suite/
  tasks/<task-id>/task.md        # énoncé AUTONOME et autoporteur
  tasks/<task-id>/*.json|csv     # données si nécessaire
  tasks/<task-id>/answers/       # dossier vide — A y écrira
  keys/<task-id>.key.json        # CLÉS SCELLÉES — voir ci-dessous
  README.md                      # ce que chaque tâche mesure, table des ids
```

Chaque `task.md` doit déclarer explicitement le nom du fichier de réponse
attendu et son schéma JSON exact (champ par champ), pour que la correction
soit automatisable.

Exigences de fond :

- **Déterministe** : correction objective possible sans jugement humain ;
  pas de réseau, pas de dépendance externe, pas de question d'opinion.
- **Autonome** : solvable à partir des seuls fichiers fournis.
- **Ciblée** : vise les failles documentées des LLM — calcul irréductible,
  causalité vs corrélation, sous-détermination (plusieurs solutions /
  aucune), conflits de contraintes sur longue séquence, révision de
  croyance après correction officielle, cohérence interne. Varie les
  domaines ; au moins une tâche doit punir l'abstention paresseuse autant
  que l'engagement précipité.
- **Honnête** : interdiction d'inclure la réponse ou un indice déguisé dans
  l'énoncé ; interdiction des devinettes sans clé objective.
- **Technique** : ≤ 400 lignes par fichier ; français ou anglais.

**Livrable 3 — Les clés scellées.**
Pour chaque tâche, remets à l'arbitre SOIT un grader Node autonome
(`grader.mjs <répertoire_tâche>` qui imprime
`{passed, failed, total, score, details}` en JSON), SOIT une clé
`keys/<task-id>.key.json` décrite champ à champ. Les clés ne doivent
apparaître nulle part ailleurs et ne seront ouvertes qu'après la remise des
réponses de A.

### Clauses d'intégrité (symétriques pour les deux agents)

1. **Aveugle** : tu ne vois pas les clés des suites de A ; A ne voit ni tes
   tâches avant d'avoir répondu, ni tes clés.
2. **Scellé** : les clés vivent chez l'arbitre entre la création et la
   correction.
3. **Autonomie** : toute tâche est solvable hors ligne à partir de ses
   seuls fichiers.
4. **Pas de sabotage** : une tâche dont la clé est fausse, ambiguë ou
   introuvable sera invalidée et comptée zéro pour toi (qualité de
   l'auteur fait partie de l'évaluation).
5. **Publication brute** : toutes les distributions sont publiées telles
   quelles, favorables ou non.

### Déroulé

1. L'arbitre te donne `blind/`.
2. Tu rends tes `answers/` (livrable 1).
3. L'arbitre corrige avec les graders de A et publie tes scores bruts.
4. Tu livres `peer-suite/` + clés scellées (livrables 2 et 3).
5. L'arbitre fait répondre A en aveugle, puis corrige avec TES clés.
6. Publication croisée des deux distributions.

### Objectif scientifique

Ce n'est pas un concours gagnant-perdant. C'est une **réplication croisée** :
vérifier si les constats de A — « le prompt expert domine », « sur calcul
irréductible, l'exécution bat le raisonnement » — se reproduisent sur un
modèle différent et sur des tâches que A n'a pas conçues. Deux biais se
neutralisent : tu testes A sur des tâches qu'il n'a pas écrites, il est
noté par des clés qu'il n'a pas fabriquées.

Si un résultat ne se reproduit pas, c'est une découverte, pas un échec.
