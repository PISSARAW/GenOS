# MORPH — Conservation des engagements

- **Statut** : Implémenté comme contrôle sémantique local Node
- **Portée** : Transformations explicites et bornées, sans création de droits ou de preuves
- **Dernière revue** : 2026-11-02

Le [module](../../backend/src/services/morphProtocol/conservation.js) expose
`verifyConservation(plan)`. Il valide d'abord la forme du plan, puis compare
les snapshots complets. Une violation lève `MorphConservationError`, avec
`code: 'MORPH_CONSERVATION_INVALID'` et une explication. Une erreur de forme
conserve le code du [validateur de contrat](protocole-morph.md).

En cas de réussite, la fonction retourne :

```javascript
{
  valid: true,
  planDigest: digest(plan),
  sourceDigest: digest(plan.sourceSnapshot),
  targetDigest: digest(plan.targetSnapshot)
}
```

Ces empreintes permettent de lier un reçu au plan exact. Elles ne sont ni une
autorisation ni une preuve que la source correspond à l'organisation réelle.
La fonction ne modifie pas ses entrées et ne produit aucun effet externe.

## Invariants

| Élément | Règle du premier profil |
| --- | --- |
| Versions | `targetVersion = sourceVersion + 1`, sans dépassement d'entier exact |
| Identifiants | Aucun doublon dans chaque collection ou roster |
| Participants | Nœuds d'exécution distincts, roster non vide fixé par le plan |
| Tâches, obligations et effets inconnus | Mêmes identifiants et contenu ; aucun abandon implicite |
| Exigences des obligations | Liste conservée exactement |
| Propriétaires | Présents dans les membres source et cible respectifs ; changement par transfert explicite exact |
| Permissions | Aucun grant nouveau ; ressources et actions cibles incluses dans la source ; conditions inchangées |
| Budgets | Mêmes identifiants, unités, plafonds, dépenses et réserves ; somme dépensée et réservée compatible avec le plafond |
| Affirmations et preuves | Mêmes identifiants et contenu, donc mêmes prédicats, domaines, limites et qualifications |
| Provenance et dépendances | Mêmes enregistrements historiques et contenu |
| Audiences | Même message, même contenu et même liste de destinataires de publication |
| Questions et incertitudes | Identifiants et contenu conservés |

Le changement de topologie et de membres est permis. Les collections de
connaissances, questions et incertitudes ne peuvent pas recevoir d'élément
nouveau dans cette transformation bornée. Une collecte de preuve, une
réévaluation ou une nouvelle décision se réalise séparément avec ses propres
gates. Les listes internes à `content` restent immuables, y compris leur ordre.

Une permission peut être réduite ou supprimée. Un propriétaire de grant
conservé ne change que par un transfert explicite. Une augmentation de budget,
une libération de réserve, une annulation d'obligation ou une clôture de tâche
n'est pas implicitement autorisée par MORPH.

## Transferts de responsabilité

Pour chaque élément dont le propriétaire change, `transfers` doit contenir un
unique enregistrement liant la collection, l'identifiant, l'ancien acteur et
le nouvel acteur. Les transferts dupliqués, inutilisés, sans élément cible ou
dont les acteurs ne correspondent pas aux snapshots sont rejetés.

Le contenu hors propriétaire reste exact. Une obligation ne peut donc pas
perdre son exigence de reçu indépendant pendant son transfert. Un effet externe
dont l'issue est inconnue conserve cette incertitude et reçoit un responsable
présent dans la cible.

## Histoire, indépendance et confidentialité

Le passage Syncytium vers Trinity ne modifie ni les origines partagées, ni les
dépendances entre contributions, ni la qualification des preuves. Une
topologie Trinity ne peut donc pas convertir une ancienne déclaration
`statisticallyIndependent: false` en confirmation indépendante. L'interprétation
de ces dépendances par un jury reste une vérification distincte.

Les destinataires d'un message confidentiel sont conservés comme métadonnée de
publication. Un nouveau membre ne rejoint pas son audience par changement du
roster. Le contrôle ne livre pas lui-même le contenu du message et ne remplace
pas l'autorisation de lecture du magasin réel.

Les membres retirés restent représentés dans l'histoire de provenance et dans
les audiences historiques. Leur retrait du roster ne donne aucun droit nouveau
et ne permet pas d'effacer leurs contributions.

## Frontières de confiance

Comparer deux déclarations cohérentes ne prouve pas que la source est complète.
L'intégration doit confronter `sourceSnapshot`, les versions et le roster à
l'état autoritatif des nœuds et de l'organisation. Chaque participant doit
vérifier son état local réel avant d'accepter la préparation.

Les participants sont des nœuds d'exécution, et les membres sont des acteurs
logiques hébergés. Le contrôle local ne peut pas déduire leur affectation à
partir du seul plan. `authorize` et les vérificateurs de checkpoint doivent
confirmer que le roster fixé couvre tous les membres concernés et qu'aucun
nœud requis n'a été omis.

Le service de conservation n'est pas raccordé automatiquement aux transitions
P0, au registre existant de morphogenèse ou à ses autorités Rust. Une intégration
de production doit préserver ces gates et ses règles de canari ; la réussite
de `verifyConservation` ne les remplace pas.

## Validation

Depuis la racine : `node backend/tests/test_morph_protocol_conservation.js`.
Le test vérifie une transformation Syncytium vers Trinity, puis injecte des
pertes d'obligations, changements de prédicat ou de domaine, retraits de limites,
effacements de provenance, élargissements d'audience ou de droits, budgets
incohérents, propriétaires absents, transferts invalides et identifiants
dupliqués. Il vérifie aussi que les nœuds d'exécution peuvent être distincts
des membres logiques.

Voir le [contrat](protocole-morph.md) et
l'[ADR](../adr/2026-11-02-protocole-morph.md).
