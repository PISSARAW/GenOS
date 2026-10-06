# Catégorisation philosophique : contrat logiciel

- **Statut** : service de comparaison local implémenté ; portée interprétative.
- **Dernière revue** : 2026-10-06.
- **Sources** : `backend/src/services/philosophy/categorizationService.js`,
  `backend/src/services/ontologyRouter.js`, `ontologyRouterHandlers.js` et
  `backend/tests/test_philosophy_concept_modules.js`.

## 1. Portée et règle de lecture

Ce service compare des caractéristiques fournies par l'appelant. Il ne découvre
pas les caractéristiques d'un objet, n'apprend pas de catégories et ne vérifie
pas la vérité des données. Les noms `prototype`, `exemplar`, `classical` et
`family_resemblance` identifient quatre procédures logicielles différentes.
Leur disponibilité ne constitue pas une validation scientifique de modèles
de cognition, ni une preuve de compréhension philosophique par un agent.

L'opération `classifyConcept` est raccordée au routeur d'ontologie, qui reçoit
les données dans `request.arguments` et le nom dans `request.operation`. L'existence
de ce raccord ne dispense pas des validations d'arguments, du lease MCP et des
limites appliquées par le transport utilisé. La fonction locale n'accorde
aucune autorité de décision, d'intégration ou d'écriture.

## 2. Entrée commune

`instance` doit être un objet non nul, distinct d'un tableau. Le modèle omis
vaut `prototype` ; un nom inconnu est refusé. Les variantes graduées reçoivent
une liste de candidats dans `prototypes` ou `exemplars`. Un candidat fournit
`category`, puis ses caractéristiques par `features` ou `vector`.

La requête reste la source de l'instance à classer. Une propriété `instance`
placée dans un candidat ne doit jamais remplacer cette requête. Un candidat
sans caractéristiques explicites est comparé à un objet vide ; ce comportement
de repli n'est pas une validation de qualité du candidat.

Exemple local :

```javascript
const { classifyConcept } = require('./backend/src/services/philosophy/categorizationService');
classifyConcept({
  model: 'prototype',
  instance: { size: 0 },
  prototypes: [
    { category: 'different', features: { size: 1 } },
    { category: 'matching', features: { size: 0 } }
  ]
});
```

Le résultat sélectionne `matching`, avec des scores ordonnés de 1 et 0.
Le classement ne modifie ni l'instance ni la liste de candidats.

## 3. Similarité déclarée

Le calcul utilise l'union des clés des deux objets. Pour chaque clé, il
applique la comparaison de caractéristique ci-dessous ; la moyenne est
arrondie à trois décimales. Deux objets sans clé obtiennent 1 : cela exprime
seulement une convention sur des entrées vides.

| Caractéristique | Règle implémentée | Limite |
| --- | --- | --- |
| Numérique | `max(0, 1 - abs(a - b))`, après conversion numérique | les unités et l'échelle doivent être choisies par l'appelant |
| Booléen ou chaîne | égalité stricte, après remplacement d'une valeur nulle/absente par `false` | aucune similarité linguistique ou sémantique |
| Tableau | occurrences communes à gauche divisées par la taille de l'union distincte | pas une distance générale sur multisets |

L'ordre de sélection est tableaux, booléens, chaînes, puis nombres. La branche
numérique utilise zéro comme repli pour une valeur falsy. Un objet non
convertible ou une valeur non finie peut produire un résultat non exploitable :
ce service n'est pas un validateur exhaustif de vecteurs.

Les tableaux comportent des conventions historiques importantes : si l'un
est vide, le résultat de cette branche vaut 1 ; des doublons peuvent aussi
modifier le décompte. Ne pas interpréter la sortie comme une probabilité
calibrée ou comme une mesure toujours comprise entre zéro et un sur des
entrées arbitraires. Ces limites sont conservées, pas corrigées implicitement
par la réparation du classement.

## 4. Procédures et sorties

### 4.1 Prototype

Chaque prototype est comparé à **l'instance de la requête**. Les scores sont
triés par ordre décroissant. La catégorie et l'appartenance proviennent du
meilleur candidat, et le statut vaut `graded_membership`.

### 4.2 Exemplaires

Chaque exemplaire est comparé à la même instance. L'appartenance est la moyenne
des meilleurs scores sélectionnés. `topK` est converti en nombre, avec un repli
à 3 et un minimum de 1 ; la sélection repose sur la sémantique de `slice`.
L'absence de validation exhaustive de `topK` reste une limite du service.

Pour une instance `{ size: 1 }` et deux exemplaires de tailles 1 et 0,8,
les scores sont 1 et 0,8. Avec `topK: 2`, l'appartenance vaut donc 0,9.
Changer l'instance en `{ size: 0 }` conduit à 0 et 0,2, soit une moyenne de 0,1.
Ce changement est une sonde causale de l'utilisation effective de la requête.

La catégorie retournée reste celle du meilleur candidat, même si la moyenne
porte sur plusieurs catégories. Le service ne réalise pas un vote majoritaire
par catégorie. `typicality` provient du premier candidat lorsqu'elle est fournie,
sinon de l'appartenance calculée.

Une liste vide produit `category: null`, `membership: 0` et aucune entrée dans
`scores`. Une absence de candidat ne doit pas être présentée comme un choix
de catégorie réussi.

### 4.3 Conditions classiques

`requiredFeatures` énumère des conditions nécessaires. Une caractéristique
absente ou égale à `false` figure dans `missing`. L'appartenance est la fraction
des conditions présentes ; la catégorie n'est retournée que sans manque.
Une liste vide de conditions reçoit conventionnellement une appartenance de 1.
Cette procédure teste la présence déclarée, pas la vérité d'une propriété.

### 4.4 Ressemblance de famille

`features` doit être une liste non vide. Le service somme les poids des
caractéristiques dont la valeur dans l'instance est truthy, puis divise par
le poids total. Les poids utilisent la conversion numérique et un repli à 1 ;
le seuil omis vaut 0,5. La sortie comporte `matchedFeatures`, `membership`,
`threshold` et `status: fuzzy_membership`.

Ces conversions n'imposent pas à elles seules des poids finis et positifs.
Une entrée mal choisie peut donc invalider une interprétation probabiliste.
L'appelant conserve la responsabilité de la normalisation et des unités.

## 5. Défaut corrigé et falsification

Le chemin gradué transmettait la liste de candidats au scoreur, mais perdait
l'instance reçue par `scoreAndSort`. Le scoreur comparait alors les
caractéristiques d'un candidat à elles-mêmes. Des candidats différents
pouvaient tous obtenir 1 et la première catégorie être retenue artificiellement.

La réparation transmet explicitement l'instance au scoreur de chaque candidat.
Elle ne change ni la distance numérique, ni l'agrégation, ni les deux autres
procédures. Les contre-exemples portent sur :

- un mauvais prototype placé avant le prototype identique à la requête ;
- une propriété `instance` trompeuse dans le mauvais candidat ;
- deux requêtes donnant des moyennes distinctes sur les mêmes exemplaires ;
- une liste vide et la conservation des objets d'entrée.

Une sortie constante à 1 échoue à ces sondes, même si le transport et le format
de réponse sont valides.

## 6. Vérification et maturité

```powershell
node backend/tests/test_philosophy_concept_modules.js
```

La suite couvre aussi d'autres services philosophiques. Son succès après
réparation prouve ces exemples logiciels, pas un corpus réel de catégorisation
ni une qualité universelle de la métrique. Les gates qualité, Node et Rust du
monorepo restent obligatoires pour qualifier une release.

Le service spécialisé et les 375 profils d'audit sont deux chemins distincts.
Un audit déclarant qu'une liste de catégories existe ne démontre pas que ce
classifieur a été exécuté. Inversement, un score de classification ne peut
remplacer un reçu runtime ou indépendant admissible pour tous les concepts.

## Voir aussi

- [Registre philosophique](registre-philosophique.md).
- [Contrats philosophiques et Ontogenèse](contrats-philosophiques-ontogenese.md).
- [Matrice des 375 audits](matrice-operationnelle-philosophique.md).
