# ADR 0692 — Responsabilité ambiante versionnée et oubli révocable

- **Statut** : Accepté pour une tranche backend isolée, non raccordée aux connecteurs
- **Date** : 2026-10-20
- **Domaine** : agent ambiant, consentement, mémoire, preuve, autorité
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0044, ADR 0206, ADR 0297, ADR 0626

## Contexte

Un agent généraliste toujours actif peut observer plusieurs applications et
réagir rapidement. Cette disponibilité ne suffit cependant pas à établir sa
responsabilité dans le temps : un transport réussi ne prouve ni le consentement
courant, ni un effet externe, ni la validité d'un apprentissage issu du
feedback.

GenOS doit pouvoir conserver un mandat durable sans constituer une mémoire
indifférenciée de toutes les applications. Il doit aussi faire de l'oubli une
transition vérifiable, pas une promesse textuelle, et empêcher qu'un feedback
du producteur soit assimilé comme une vérité.

## Décision

La tranche `ambientAgency` introduit une responsabilité bornée par organisation
et projet. Chaque responsabilité lie un propriétaire, un mandat, un
consentement, un objectif endogène et la référence d'une trajectoire externe.
Sa politique énumère les applications et champs observables. La tête mutable
ne peut avancer que d'une version ; les versions sont append-only et chaînées
par leurs empreintes.

Une observation est admise seulement si :

1. la responsabilité est active et sa version courante est relue dans la même
   transaction que l'insertion ;
2. l'application source et le consentement correspondent à la politique ;
3. un collecteur et une permission explicites fournissent la provenance ;
4. au moins un champ autorisé subsiste après minimisation.

Le payload brut n'est jamais persisté. Le contenu minimisé est séparé des
métadonnées de provenance. Une révocation avance la responsabilité vers
`REVOKED`, rend toute nouvelle observation impossible et remplace tous les
payloads minimisés par des tombstones. Les identifiants, références de source,
empreintes et reçus d'oubli restent conservés pour l'audit. Ce mécanisme est un
oubli du contenu applicatif, pas un effacement cryptographique de toute trace.

Le feedback est enregistré comme candidat, jamais comme croyance. Une décision
d'apprentissage exige quatre acteurs distincts : propriétaire, proposant,
vérificateur et autorité. Le vérificateur fournit un verdict et des références
de preuve ; l'autorité cible la version courante. Même un verdict soutenu ne
modifie aucune mémoire de production : il rend seulement le candidat éligible
à une étape d'apprentissage ultérieure.

L'arbitre pur choisit entre `OBSERVE`, `LEARN`, `PROPOSE_ACTION` et
`NO_CHANGE`. L'objectif endogène n'est évalué qu'à travers la trajectoire
externe déclarée. Une preuve de transport, telle qu'un HTTP 200, ne remplace
pas une mesure d'effet. `PROPOSE_ACTION` exige donc des références de mesure
de l'effet, une observation liée, une vérification indépendante et une autorité
courante. Toute sortie porte `executionAuthorized: false` : cette tranche ne
dispose d'aucun exécuteur et ne déclenche aucune action externe.

## Conséquences

### Positives

- la responsabilité survit au processus et son évolution reste attribuable ;
- les applications ne deviennent pas une mémoire globale implicite ;
- la révocation coupe l'observation et purge les contenus dans une transaction ;
- le feedback contradictoire reste représentable sans assimilation aveugle ;
- `NO_CHANGE` est une issue normale quand l'effet est stable ou la preuve
  insuffisante ;
- le succès du connecteur reste distinct de l'évolution réelle de la métrique.

### Négatives et limites

- aucun connecteur, route HTTP, outil MCP, scheduler ou boucle always-on n'est
  raccordé par cette tranche ;
- les identités de vérification et d'autorité sont contrôlées par valeur, sans
  signature cryptographique dans ce module ;
- l'oubli conserve les métadonnées et empreintes nécessaires à l'audit ; une
  politique de rétention doit encore décider de leur durée ;
- `LEARN` et `PROPOSE_ACTION` sont des décisions de politique, pas des effets
  appliqués ni des preuves de valeur produit.

## Preuves exécutables

- `backend/tests/test_ambient_responsibility_ledger.js` vérifie la persistance,
  l'idempotence, les conflits de version, l'isolation de portée et la reprise ;
- `backend/tests/test_ambient_observation_consent.js` vérifie le consentement,
  la membrane applicative, la minimisation, la révocation et l'impossibilité de
  restaurer un payload oublié ;
- `backend/tests/test_ambient_feedback_arbitration.js` vérifie l'absence
  d'assimilation directe, l'indépendance des acteurs, les quatre issues de
  l'arbitre et le refus d'une preuve limitée au transport.

## Alternatives écartées

- **Copier tout le contexte des applications dans une mémoire générale** :
  finalité trop large, révocation impraticable et provenance diluée.
- **Apprendre directement des corrections utilisateur** : le feedback peut être
  ambigu, local, contradictoire ou produit par la même trajectoire en erreur.
- **Autoriser l'action dès qu'un connecteur répond** : la disponibilité du
  transport ne mesure pas l'effet réel de l'action.
- **Supprimer toutes les lignes à la révocation** : disparition de la preuve
  que la révocation et l'oubli ont effectivement été traités.
