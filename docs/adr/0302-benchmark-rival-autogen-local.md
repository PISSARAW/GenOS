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

Un adaptateur exécute AutoGen AgentChat avec Ollama local pour le cas LPT.
Il conserve la réponse brute, le modèle et la version du framework.
Un validateur distinct reparcourt cette réponse, vérifie une affectation
complète des travaux, recalcule les charges et compare le digest du
transcript. Les autres cas restent `unmeasured` pour cet adaptateur.
Le score LPT utilise le même oracle de makespan que GenOS.

## Conséquences

Un cas commun devient comparable sans adapter la réponse rivale au reçu
interne de GenOS. Le digest du transcript atteste seulement que la réponse
stockée n'a pas changé entre l'exécution et la lecture ; il ne prouve pas
l'identité du modèle ou du serveur. Un essai local est un échantillon,
pas une estimation de performance générale.

## Alternatives

- Générer un reçu GenOS à partir de la réponse AutoGen : rejeté, car
  cela attribuerait au rival une exécution du runtime GenOS.
- Compter les cas sans oracle comme réussis : rejeté, faute de preuve
  comparable.
