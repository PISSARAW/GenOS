# Conventions de documentation

Ce document décrit comment écrire, nommer, lier et faire évoluer la documentation
GenOS. Il s'applique à tout fichier sous `docs/`. Il est volontairement hors du gate
de qualité de code (`scripts/ci/check_code_quality.py` cible le code source, pas
les `.md`).

L'index complet des documents se trouve dans [README.md](README.md).

---

## 1. Types de documents

| Type | Rôle | Structure attendue |
| --- | --- | --- |
| **Tutoriel** | apprendre pas à pas | étapes ordonnées, vérifiable |
| **Concept** | expliquer *pourquoi* / *comment* | canevas en 10 sections (ci-dessous) |
| **Référence** | décrire un contrat stable | sections courtes, tableau, exhaustivité |
| **Guide d'exploitation** | exécuter une tâche | prérequis, procédure, diagnostic, rollback |
| **ADR** | tracer une décision | `Contexte`, `Décision`, `Conséquences`, `Alternatives` |
| **Preuve / benchmark** | rapporter un résultat mesuré | protocole, résultat, limites, date |

Ne pas mélanger les types : un document de référence n'a pas vocation à expliquer la
biologie, et une fiche de concept ne remplace pas un contrat d'API.

---

## 2. Canevas des fiches de concepts

1. Définition du domaine
2. Modèle mathématique ou logique
3. Analogies biologiques et limites réelles
4. Cas d'usage et objectifs métier
5. Exemples concrets
6. Schéma ou diagramme
7. Architecture technique
8. Processus d'exécution ou de validation
9. Comparaison avec le marché
10. Limites, garde-fous, non-objectifs

Les sections peuvent être adaptées ou regroupées, mais les points **7 (architecture)**,
**8 (processus)** et **10 (limites)** sont obligatoires pour toute fiche de concept.

---

## 3. Statut de maturité

Toute fiche doit rendre explicite son niveau de réalité. En-tête recommandé :

```markdown
- **Statut** : Implémenté | Partiel | Cadre conceptuel
- **Portée** : ...
- **Dernière revue** : AAAA-MM-JJ
```

- **Implémenté** : le comportement décrit existe dans le dépôt et est vérifiable.
- **Partiel** : seulement une partie est implémentée ; préciser les écarts.
- **Cadre conceptuel** : modèle ou métaphore, sans implémentation complète.

Ne jamais présenter une métaphore biologique comme une fonctionnalité prouvée.

---

## 4. Arborescence et nommage

- **Dossiers** : familles numérotées `NN-slug` (`01-concepts`, `02-orchestration`, …),
  chacune avec un `README.md` d'index. Sous-familles possibles (`biomimetisme/`,
  `nosologie/`, `topologies/`, `benchmarks/`).
- **Fichiers** : `kebab-case.md` pour les documents, `NNNN-slug.md` pour les ADR.
- **Unicité** : un sujet = un document. Ne pas dupliquer une fiche dans deux familles ;
  lier depuis l'autre famille.
- **Provenance** : les chemins `docs/*.md` sont des identifiants scellés (`source_doc` des
  `agents/*.agent.json`, encodé dans les binaires `agents/dna/*.dna`, persisté dans SQLite
  `agent_genomes.source_doc`, lu par `crates/genos-cli/src/commands/world_runner.rs`).
  Tout déplacement **exige une migration** : `git mv`, mise à jour des `source_doc` des
  manifestes, puis recompilation des `.dna` via `genos genome compile`. Voir
  [ADR 0005](adr/0005-reorganisation-arborescence-documentaire.md).

Ne jamais renommer ou déplacer un document sans exécuter la migration de provenance.

---

## 5. Langue

- Documentation en **français**, sous `docs/`.
- Les README de code (`backend/README.md`, `crates/*/README.md`) peuvent rester en anglais.
- Les runbooks d'exploitation peuvent être en anglais si l'original l'est déjà
  (ex. [runbook-recovery.md](04-exploitation/runbook-recovery.md)).

---

## 6. Liens

- Utiliser des **liens relatifs** entre documents et vers le code (`../crates/...`).
- **Interdit** : liens absolus machine-spécifiques (`file:///C:/Users/...`) et liens
  absolus de système de fichiers. Ils ne fonctionnent que sur la machine d'origine.
- Pour pointer une ligne de code, préférer l'ancre GitHub : `../crates/.../fichier.rs#L12`.
- Un lien vers un fichier supprimé doit être corrigé dans le même changement.

---

## 7. Ajouter un document

1. Vérifier qu'il ne recouvre pas un document existant (sinon, enrichir l'existant).
2. Choisir le type (section 1), la famille (section 4) et le nom (section 4).
3. Écrire selon le canevas adapté, avec un en-tête de statut (section 3).
4. L'indexer dans le `README.md` de la famille **et** dans [README.md](README.md).
5. Utiliser des liens relatifs uniquement.

---

## 8. Révision

- Mettre à jour `Dernière revue` lors d'une relecture effective.
- Un ADR est requis pour toute décision d'architecture (voir [adr/README.md](adr/README.md)).
- Les affirmations du README racine et de la documentation doivent rester alignées sur
  ce qui est réellement implémenté.

---

## Voir aussi

- [README.md](README.md) — hub et index par familles.
- [adr/README.md](adr/README.md) — décisions d'architecture.
- [../AGENTS.md](../AGENTS.md) — règles pour les agents de code.
