# EVIDENCE/JURY — Engagement aveugle des verdicts

- **Statut** : Partiel, profil exécutable local avec état exportable.
- **Portée** : agrégation des déclarations observables ; aucun transport ni mécanisme d'authentification propre.
- **Dernière revue** : 2026-11-02.

## Contrat

Le module [`jury.js`](../../backend/src/services/evidenceProtocol/jury.js)
expose `BlindJury` et `commitmentFor`. Le profil est
`genos.evidence.jury/v1`. Le contexte JSON est copié et limité à 65 536 octets
UTF-8 au maximum ; `maxContextBytes` permet une borne plus stricte.

Le responsable du jury fixe avant toute contribution :

- `juryId`, le contexte borné et son empreinte canonique SHA-256 ;
- la liste des participants avec `agentId`, `incarnationId`, `executionId` ;
- leurs `provenanceRoots`, `methodId` et `dependsOn` déclarés.

Une racine de provenance au moins est obligatoire. Une dépendance explicite
désigne un participant du jury. La liste, les déclarations et le contexte sont
immuables pendant la session.

## Conversation

1. `new BlindJury({ juryId, context, participants })` fixe la session.
2. Chaque vérificateur calcule `commitmentFor(jury.descriptor(), reveal)`, avec
   `reveal = { verifierId, verdict, nonce }`. Les verdicts sont `accept`,
   `reject` et `unknown`. Le nonce secret contient entre 32 et 256 caractères ;
   le vérificateur doit employer un générateur cryptographiquement sûr.
3. `jury.commit({ verifierId, commitment })` enregistre chaque engagement.
4. `jury.reveal(reveal)` est refusé tant que tous les engagements ne sont pas
   présents. L'empreinte lie jury, contexte, liste et déclarations, identité,
   verdict et nonce. Un nouvel engagement contradictoire est refusé ; une
   répétition identique est idempotente.
5. `jury.aggregate({ minSupportGroups })` exige toutes les révélations. Il
   retourne `supported` seulement si le nombre de groupes favorables atteint
   le seuil et qu'aucun groupe n'est défavorable ou indéterminé.

La politique accepte uniquement `minSupportGroups` : tout autre champ est
refusé pour éviter de laisser croire qu'une contrainte supplémentaire a été
appliquée. Les identifiants sont ordonnés par unités UTF-16, sans tri dépendant
de la langue du runtime.

Le code appelant doit isoler les vérificateurs et retenir les verdicts reçus
jusqu'à la fin de la phase d'engagement. La machine d'état interdit une
révélation anticipée via son API ; elle ne contrôle pas les communications
latérales, la mémoire des modèles ni les accès au stockage de l'agrégateur.

## Qualification des contributions

Deux participants sont corrélés s'ils déclarent une exécution commune, une
racine de provenance commune ou une dépendance directe. Les composantes
connexes de cette relation sont calculées transitivement et indépendamment de
l'ordre des contributions. Cinq clones d'une même conclusion forment ainsi
un seul groupe favorable. Un groupe dont les verdicts divergent reste
`unknown` ; une majorité interne ne masque pas le désaccord.

Le résultat publie séparément `executionGroups`, `provenanceGroups` et
`methodGroups`. Une méthode commune est une limite observable distincte ;
elle ne fusionne pas, à elle seule, les groupes de provenance/exécution utilisés
par `minSupportGroups`. Le consommateur doit examiner cet axe s'il exige une
diversité de méthode. `statisticalIndependence` vaut toujours
`not_established`. Les déclarations sont une entrée de confiance, pas une
preuve que des origines cachées ou des erreurs communes n'existent pas.

`supported` est un résultat d'agrégation, pas une autorisation de promotion.
Le consommateur doit encore vérifier l'objet exact, la fraîcheur des preuves,
la politique applicable et l'autorité du demandeur.

## Reprise et limites de confiance

`jury.snapshot()` produit `{ state, stateDigest }`, sérialisable en JSON.
`BlindJury.restore(snapshot)` recalcule les empreintes et rejoue les engagements
puis les révélations avec les mêmes contrôles qu'en fonctionnement normal.
La reprise conserve les identités et refuse notamment une révélation sans la
phase d'engagement complète.

L'empreinte détecte une divergence ; elle n'authentifie pas le producteur d'un
snapshot. Le stockage et les messages doivent être protégés par l'intégration,
qui authentifie aussi l'auteur de chaque engagement et de chaque révélation.
Les snapshots contiennent les nonces et les verdicts déjà révélés et restent
réservés à l'agrégateur. Le module ne fournit pas de journal durable automatique,
de délai d'expiration, de résolution des participants silencieux ou d'isolation
réseau. L'appelant doit persister un snapshot avant d'accuser durablement
l'application d'une transition ; un crash avant persistance impose sa répétition.

## Vérification exécutable

`node backend/tests/test_evidence_protocol_jury.js` couvre la révélation
anticipée, les engagements contradictoires, les changements de contexte et de
liste, les snapshots altérés, la reprise partielle, les dépendances transitives,
le désaccord et le regroupement de cinq clones.
