# ADR 0605 — Dispositions d'implémentation philosophique

- Statut : Accepté
- Date : 2026-10-18
- Domaine : philosophie opérationnelle, contrats, autorité runtime
- Décideurs : mainteneurs GenOS
- Lié à : [ADR 0326](0326-audits-philosophiques-executables-et-preuves.md)

## Contexte

Les 420 concepts possèdent un profil d'audit logiciel, mais cette couverture ne
distingue pas clairement une référence documentaire, un service analysable et
une capacité runtime. En particulier, les 195 entrées sans service exécutable
ne doivent pas être présentées comme des fonctionnalités du runtime.

## Décision

Attribuer exactement une disposition à chaque concept normalisé et à son
contrat compilé :

- `reference-only` lorsque le service métier n'est pas exécutable ;
- `bounded-audit` lorsqu'un service exécutable existe sans autorité runtime ;
- `runtime-capability` lorsque service exécutable et autorité déclarée coexistent.

Le détail porte l'usage admis et les limites. Il fixe toujours
`runtimeAuthorityGranted: false` et `promotionEligible: false`, car le contrat
philosophique décrit ou audite un mécanisme sans créer de permission. Une
capacité runtime reste gouvernée par son propre lease, ses budgets et ses gates.

Les schémas rendent la disposition obligatoire. La validation rejette les
incohérences avec la maturité du service. Les endpoints de santé publient les
comptes et les listes acceptent un filtre de disposition.

## Conséquences

### Positives

- Les 195 références non exécutables sont identifiables sans interpréter des notes.
- Un audit satisfait ne peut pas être confondu avec une autorisation runtime.
- Les inventaires et clients MCP peuvent filtrer les trois périmètres.

### Négatives

- Le classement dépend de la qualité du catalogue `serviceMaturity` et de
  l'autorité déclarée ; toute évolution de ces sources peut déplacer une entrée.
- `runtime-capability` n'atteste ni déploiement en production ni vérité philosophique.

## Alternatives

- Réutiliser `status` ou `classification` : rejeté, car ces champs mélangent
  maturité conceptuelle et intégration logicielle.
- Déduire la disposition du domaine philosophique : rejeté, car un domaine ne
  constitue ni une preuve d'exécution ni une autorité.
