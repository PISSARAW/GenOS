# ADR 0302 — Première mesure rivale locale avec AutoGen

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Workers, benchmarks comparatifs, provenance
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0294, ADR 0301

## Contexte

Le protocole comparatif acceptait un adaptateur rival, mais aucun rival
réel n'était exécuté. Il exigeait le reçu interne GenOS même lorsque
le concurrent fournissait une sortie valide dans son propre runtime.

## Décision

Un adaptateur exécute AutoGen AgentChat avec Ollama local pour LPT et
`subset_sum`.
Il conserve la réponse brute, le modèle et la version du framework.
Un validateur distinct reparcourt cette réponse, vérifie une affectation
complète des travaux ou des indices de sous-ensemble, recalcule les
charges ou la somme et compare le digest du transcript. Les autres cas
restent `unmeasured` pour cet adaptateur. Les scores utilisent les mêmes
oracles de makespan et d'existence de sous-ensemble que GenOS.

## Conséquences

Deux cas communs deviennent comparables sans adapter la réponse rivale au reçu
interne de GenOS. Le digest du transcript atteste seulement que la réponse
stockée n'a pas changé entre l'exécution et la lecture ; il ne prouve pas
l'identité du modèle ou du serveur. Quatre essais locaux LPT ont donné des
makespans différents (9, 7, 9 puis 7) ; ils ne constituent pas une estimation
de performance générale.

Une cinquième mesure LPT sur le jeu courant a produit 9, et une troisième
mesure `subset_sum` n'a pas fourni de témoin valide. Le digest de suite
`sha256:69d4ca77f2bef18d14ad6ce7a3cfd4af8ee8b3bb44bf9dc74afe4624fd075d5d`
lie les deux rapports du 2026-10-04 : GenOS passe les deux cas communs,
AutoGen échoue sur les deux. La variabilité observée interdit d'en déduire
une parité ou une supériorité générale.

## Alternatives

- Générer un reçu GenOS à partir de la réponse AutoGen : rejeté, car
  cela attribuerait au rival une exécution du runtime GenOS.
- Compter les cas sans oracle comme réussis : rejeté, faute de preuve
  comparable.
