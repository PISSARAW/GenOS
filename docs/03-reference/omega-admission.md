# OMEGA Execution — Admission durable et obligations

- **Statut** : Implémenté comme API locale expérimentale Node/SQLite
- **Portée** : Description effective, soumission et acceptation d'un plan exact
- **Dernière revue** : 2026-11-02

Le [module](../../backend/src/services/omegaProtocol/admission.js) expose
`OmegaAdmission(options)`, avec trois callbacks obligatoires : `authorize`,
`describeRuntime` et `verifyPlan`. `dbPath` sélectionne le magasin durable ;
sans ce paramètre, le magasin est en mémoire. `clock` retourne une date ou
des millisecondes Unix.

## Conversation et API

La conversation suit `DESCRIBE_RUNTIME → SUBMIT_PROGRAM → ACCEPT_PLAN`.
Les messages conservent acteur, audience, portée, mission, conversation,
opération, générations et autorité. Chaque étape référence la précédente
dans `causalRefs`. Un autre programme exige une nouvelle conversation.

| Méthode | Résultat |
| --- | --- |
| `apply(message)` | Applique une transition ou rejoue son résultat exact |
| `state(context)` | Copie détachée de la session ou `null` |
| `acceptedPlan(query)` | Plan accepté lié à la requête exacte, sinon `null` |
| `history()` | Journal local ordonné des messages et résultats |
| `close()` | Ferme le magasin |

`query` contient `scope`, `missionId`, `conversationId`, `planId` et
`planDigest`. Le résultat contient le plan, le programme, les capacités, la
soumission et `context`, dont l'acteur, les générations, l'autorité et
l'expiration de la soumission. Une soumission expirée ne peut plus produire
de résultat accepté par ce getter.

Ces lectures sont des API locales de confiance ; un endpoint public doit
ajouter son contrôle d'accès. Le getter ne certifie pas la fraîcheur du monde
extérieur ou des capacités. L'exécuteur doit confronter de nouveau la génération
du runtime, la base, l'environnement et l'autorité avant les opérations et les
effets concernés.

## Capacités et autorisation

`authorize(message)` reçoit une copie profondément figée et doit retourner
exactement `true`. Il est rappelé après les vérifications asynchrones, avant
commit. L'expiration du message et de la soumission est aussi réévaluée.

`describeRuntime({message, stage})` retourne les capacités effectives du
registre installé. La soumission et l'acceptation comparent leur empreinte à
la description initiale. Les capacités sont redécrites après `verifyPlan` pour
détecter une modification survenue pendant cette vérification.

L'intégration doit construire cette description depuis les opérations,
domaines, vérificateurs et ressources réellement disponibles. Retourner un
objet statique arbitraire ne vérifie pas leur présence. En particulier,
annoncer `INFER` exige un inferer installé ; une garantie d'effet exige
l'adaptateur qui l'applique réellement à la ressource.

## Plan et obligations

Le plan est construit par l'admission, à partir du programme exact et des
capacités vérifiées. Le demandeur ne fournit pas sa liste d'obligations.

| Champ | Liaison |
| --- | --- |
| `programDigest` | Véritable empreinte MessagePack G-CIR Ω |
| `capabilitiesDigest` | Description effective du runtime |
| `policyDigest` | Politique versionnée de la soumission ; la politique native est aussi liée par le programme |
| `baseDigest`, `environmentDigest` | Base et environnement déclarés et vérifiés |
| `runtimeId`, `runtimeGeneration`, `domain` | Runtime et domaine ciblés |
| `contextDigest` | Portée, mission, conversation, acteur, audience, générations, autorité et expiration |
| `budget` | Unité, plafond, dépenses et réserve exacts |
| `obligations` | Toutes les opérations du programme, avec références et dépendances, à l'état `open` |

Le vrai registre d'obligations contrôle les références manquantes et les cycles.
La présence d'une capacité ne remplace pas les listes de permissions natives
de `program.policy`. Les demandes d'effets cumulées doivent tenir dans
`limit - spent - reserved`, sans recréditer une dépense ou consommer la réserve
protégée. Ce contrôle préliminaire ne remplace pas le débit atomique de la
ressource au moment de l'effet.

À `ACCEPT_PLAN`, l'admission exige l'empreinte exacte, reconstruit le plan
complet et vérifie son égalité. Aucune opération ne peut être retirée ou déclarée
satisfaite par le demandeur. Une admission réussie ne constitue pas une
exécution réussie.

## Vérification de confiance

`verifyPlan(request)` reçoit une copie profondément figée contenant
`stage`, `message`, `plan`, `program`, `submission`, `capabilities` et `context`.
Il doit confronter les données aux sources autoritatives : politique applicable,
base, environnement, budget, registre effectif et identité du demandeur.

Le reçu doit lier la requête complète :

```javascript
{
  status: 'validated',
  requestDigest: digest(request),
  receiptDigest: 'sha256:...'
}
```

Le digest du reçu doit désigner une preuve réellement disponible et vérifiée.
Fabriquer cet objet à partir de la seule requête ne valide ni son budget ni son
autorité. Le callback est exécuté à la soumission puis à l'acceptation, avec
des requêtes distinctes. Une approbation humaine éventuelle reste une condition
d'autorisation ; elle ne remplace pas un test du programme ou de son résultat.

## Persistance, reprise et limites

SQLite WAL conserve la session et les messages avec leurs résultats et
empreintes. Le commit est atomique. Une reprise exacte ne réapplique pas la
transition ; une clé réutilisée avec un autre contenu est rejetée. Un changement
concurrent pendant un callback rend la version attendue obsolète et exige une
nouvelle lecture avant reprise. Les callbacks doivent réaliser des vérifications
sans effet externe irréversible.

Les anciens plans et refus restent dans le journal. Une capacité manquante,
une génération différente ou un contexte périmé ne sont jamais convertis en
succès de transport. Une nouvelle base ou politique nécessite une nouvelle
admission liée à ces valeurs.

L'API ne raccorde pas automatiquement les anciens domaines Ω, les fournisseurs
de modèles, les autorités de production ou les ressources externes. Le codec
et le registre d'obligations existants sont réellement utilisés ; la validité
des sources externes dépend des adaptateurs de confiance effectivement fournis.

Depuis la racine : `node backend/tests/test_omega_protocol_admission.js`.
Le test couvre la reprise SQLite, les obligations complètes, les capacités et
permissions manquantes, les graphes invalides, les budgets, les changements de
génération, les reçus mal liés, la révocation, l'expiration et les écritures
concurrentes pendant une vérification.
