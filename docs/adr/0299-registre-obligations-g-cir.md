# ADR 0299 - Registre d'obligations et graphe G-CIR

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : cognition, orchestration, preuve
- **Décideurs** : équipe GenOS
- **Lié à** : [ADR 0294](0294-contrat-residuel-cognitif-signal-plane.md), [ADR 0297](0297-g-cir-generation-hypotheses-trinity.md), [G-CIR](../02-orchestration/g-cir.md)

## Contexte

Les adaptateurs Signal Plane et Trinity produisaient un contrat d'inférence,
mais celui-ci ne distinguait pas formellement les entrées déjà matérialisées,
les portes imposées par le runtime, l'inférence encore ouverte et la vérification
à effectuer. Une réutilisation du reçu pouvait donc paraître couvrir des
obligations qui n'étaient pas inscrites dans son audit.

## Décision

Un registre versionné (`version: 1`) valide les nœuds `INPUT`, `GATE`, `INFER`,
`CHECK` et `EMIT`, leurs états (`satisfied`, `enforced`, `open`, `blocked`), leur
justification éventuelle et leurs dépendances. Il rejette les champs inconnus,
les identifiants dupliqués, les dépendances absentes, les cycles, les nœuds
prématurément résolus et les graphes
de plus de 64 nœuds. Un ordre topologique déterministe produit le digest du
graphe ; le plan expose les obligations résiduelles, exécutables et en attente.
Un appel au modèle n'est admissible que si un nœud `INFER` ouvert est exécutable.

Les deux adaptateurs construisent un graphe avant l'appel. Le Signal Plane lie
l'entrée au digest du prompt et l'escalade à `llmRequired`. Trinity lie la
mission au même type de digest, la demande à `generateHypotheses` et le budget
à la limite réellement transmise au routeur. Les nœuds `CHECK` restent ouverts :
une réponse de modèle ne les satisfait pas. Le contrat d'inférence passe à la
version 2 ; son audit MessagePack persiste le graphe et son digest, revérifiés
à la réutilisation du reçu.

Ce registre décrit l'état d'admission avant l'inférence. Il ne vérifie pas une
preuve externe, ne résout pas automatiquement des nœuds `READ` ou `CALL` et
n'ordonnance pas les missions libres. La conservation de contraintes textuelles
est contrôlée sur les champs projetés et le digest des octets rendus ; aucune
analyse sémantique universelle n'est revendiquée.

## Conséquences

### Positives

- Un graphe invalide ou sans inférence exécutable ne déclenche pas le modèle.
- L'audit distingue les portes imposées, le résidu et la vérification en attente.
- Un budget ou graphe divergent pour le même rendu ne réutilise pas un reçu
  antérieur : la comparaison de l'audit échoue fermée.

### Négatives

- Le nœud `CHECK` demeure une obligation ouverte sans vérificateur raccordé.
- La clé SQLite historique ne contient pas le digest du graphe. Si le prompt
  reste identique mais que le budget change, il faut une politique explicite
  de réadmission ou une migration de clé avant une nouvelle invocation.
- La représentation canonique est locale à Node.js ; elle ne constitue pas
  encore un format binaire inter-langages.

## Alternatives

- Ajouter le graphe comme simple commentaire du prompt : écarté, car il ne
  permettrait ni validation de dépendances ni audit indépendant.
- Considérer `CHECK` satisfait après une réponse bien formée : écarté ; une
  syntaxe valide n'est pas une preuve.
- Modifier immédiatement la clé SQLite : différé pour éviter une migration
  de persistance sans politique de réadmission et de reprise définie.
