# ADR 0324 — Régénération Axolotl avec admission exécutable

- **Statut** : Accepté.
- **Date** : 2026-10-06.
- **Domaine** : Régénération, cognition, plasticité.
- **Décideurs** : Mainteneurs GenOS.
- **Lié à** : [Concept Axolotl](../01-concepts/biomimetisme/axolotl.md), ADR 0183.

## Contexte

Le premier parcours confondait contrôles structurels et équivalence fonctionnelle.
Un démarrage de mission ne fournissait pas de preuve de résultat. Les maps
exportées ne réhydrataient pas les registres internes, et la reconstruction
partielle pouvait inverser les frontières du graphe.

## Décision

La régénération dispose d'un état SQLite versionné par orchestrateur. Un contrat
de rôles, de routage et de rappel cognitif est fixé avant toute expérience.
Un worker déterministe exécute ces probes sur une copie de la topologie, sans
code utilisateur, outils ni credentials du parent. Une transaction adopte le
résultat uniquement si les probes passent et si la version source est encore
courante. Les preuves lient session, contrat, topologie et exécution.

Les remplacements ciblés conservent les rôles, métadonnées des frontières et
composants sains. Le rollback refuse d'écraser une génération ultérieure.
La cognition, le régulateur de métamorphose et la comptabilité utilisent la
même frontière d'admission. Les primitives restent soumises aux leases du
pipeline existant.

## Conséquences

### Positives

- Aucun succès issu du seul transport ou d'une simple forme de graphe.
- Reprise sur SQLite, protection contre les doubles adoptions et conflits.
- Preuves conservées des probes exécutées, incluant les échecs.

### Négatives

- Un contrat incomplet ne prouve pas des comportements non couverts.
- Le worker valide le runtime de routage/rappel Axolotl. Il ne certifie pas
  une mission LLM arbitraire ni la vérité générale d'un énoncé sémantique.
- Une adoption métier supplémentaire exige ses propres gates.

## Alternatives

Conserver les callbacks clients et déduire le succès du lancement d'un worker
a été rejeté : aucun de ces événements n'établit l'équivalence fonctionnelle.