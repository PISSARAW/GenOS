# ADR 0716 — Budget de tokens par rôle et réserve orchestrateur élastique

- **Statut** : Accepté
- **Date** : 2026-10-21
- **Domaine** : Orchestration, workers, budgets, topologies, preuve
- **Décision-id** : 0716

## Contexte

La politique historique allouait par défaut 60 % des tokens aux workers, réservait
40 % à l'orchestrateur et exigeait une tranche uniforme de 8 000 tokens par
worker. Ce garde empêchait les lancements manifestement sous-financés, mais il
confondait seuil d'admission, allocation normale et plafond d'exécution. Il
ignorait aussi les workers déterministes à zéro token et les différences de coût
entre observation, vérification, synthèse et sous-orchestration.

Une topologie atomique pouvait ainsi être refusée malgré un budget global
raisonnable, ou être dimensionnée à partir d'une réserve sans rapport avec son
coût de coordination. Inversement, augmenter `workerShare` pouvait priver
l'orchestrateur de son budget opérationnel minimal.

## Décision

Chaque `WorkerKind` reçoit un profil comprenant `minimumStartTokens`,
`targetTokens` et `maximumTokens`. Le minimum sert uniquement à l'admission, la
cible à l'allocation normale et le maximum borne les renforcements planifiés.
Les workers procéduraux et formels ont un profil nul.

Sans partage explicite, la réserve orchestrateur est calculée ainsi :

```text
minimum = 4 000 + 1 000 × nombre de workers
cible   = minimum + 5 % × budget total
plafond indicatif = 30 % × budget total
```

Le minimum prévaut lorsque le budget est trop petit pour respecter simultanément
le plafond indicatif. Un `workerShare` explicite reste accepté seulement si sa
réserve atteint le minimum. La décision et les montants sont exposés dans
`tokenPolicy.admission`.

Les topologies dédiées et les plans natifs sont atomiques : tous leurs workers
doivent recevoir leur minimum, sinon aucun n'est lancé. Les explorations non
atomiques peuvent conserver un préfixe entièrement financé. Pour une mission
complexe, tous les workers admis reçoivent d'abord leur minimum ; le reliquat est
réservé aux survivants dans la limite des plafonds de rôle. Pour une mission
simple, l'allocation progresse vers les cibles et conserve le solde comme pool de
récupération.

Les champs historiques `minimumWorkerTokens`, `workerShare` et
`orchestratorReserve` restent lisibles. Un `minimumWorkerTokens` explicitement
fourni remplace les minima non nuls, sans transformer les workers déterministes
en consommateurs de tokens.

## Conséquences

- Un transport accepté ne contourne toujours pas l'admission budgétaire.
- Une Biocénose atomique n'est jamais réduite silencieusement.
- Les refus indiquent le déficit et le budget total minimal acceptable.
- La réserve n'augmente plus mécaniquement à 40 % pour toute mission.
- Les profils initiaux sont des valeurs de politique à recalibrer sur les
  consommations vérifiées, avec versionnement lors de futures modifications.
- Les pools non attribués ne constituent pas une dépense et restent disponibles
  pour une récupération ou une continuation autorisée.

## Alternatives écartées

- **Conserver 60/40 et 8 000 partout** : simple, mais incohérent avec les rôles
  déterministes et les coûts hétérogènes.
- **Lancer tout le monde puis interrompre au plafond** : produit des topologies
  incomplètes et des preuves difficilement comparables.
- **Augmenter automatiquement `workerShare`** : masque le coût de coordination et
  peut violer la réserve minimale de l'orchestrateur.

## Voir aussi

- [Types de workers](../03-reference/types-de-workers.md)
- [Épistémologie et évidence](../01-concepts/epistemologie-et-evidence.md)
- [ADR 0013 — Modèle de survie](0013-survival-model-control-plane.md)
