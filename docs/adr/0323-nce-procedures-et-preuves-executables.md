# ADR 0323 — NCE : procédures exécutables et preuves liées au phénotype

- **Date** : 2026-10-05
- **Statut** : Accepté
- **Domaine** : NCE, procédures, phénotype et preuves

## Contexte

Le transfert de noms de capacités ne démontre pas l'acquisition d'une procédure.
Les benchmarks injectés et les ablations simulées ne suffisent pas à fermer cette
boucle. Une exception après intégration pouvait aussi laisser l'état modifié.

## Décision

Conserver les API historiques et ajouter un chemin borné : programmes déclaratifs
de transformation de données, exécutés dans un processus Node sans shell ni outil
MCP. Leur vocabulaire est fermé, les tailles limitées et les opérations pures.
Ce chemin n'accorde aucune autorité supplémentaire à un agent. Le moteur POET
conserve l'isolation, les snapshots et le vérificateur protégé existants.

Sélectionner sur training, figer la procédure puis mesurer sur held-out disjoint.
Comparer à la procédure initiale sur les mêmes tâches. Une promotion exige des
vérifications complètes et une amélioration observée. Le programme, la provenance,
les preuves positives ou négatives et le phénotype sont sauvegardés ensemble dans
la ligne d'état existante, avec contrôle de révision. Un identifiant d'expérience
ne peut être réutilisé pour une requête différente.

Ajouter un vecteur créatif versionné et masqué, distinct du vecteur structurel.
Les dimensions sans observation restent inconnues. Ajouter un protocole d'ablation
qui exécute les bras à partir d'états indépendants et conserve les sorties brutes.

## Conséquences

La fermeture est testable sans fournisseur LLM, sur les familles de tâches
documentées. Elle ne prouve aucune créativité générale ni supériorité statistique
universelle. Les prototypes restent identifiés comme simulations. Toute extension
du vocabulaire nécessite sa validation et son propre vérificateur.

## Alternatives

- Conserver seulement des noms de capacités : insuffisant pour établir un transfert exécutable.
- Exécuter du code arbitraire contenu dans les artefacts : rejeté pour préserver le confinement.
- Exiger un fournisseur LLM pour chaque test : conservé comme extension du runtime POET existant,
  sans en faire une dépendance des preuves déterministes de cette boucle.
