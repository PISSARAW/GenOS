# ADR 0352 — Enveloppe immuable et revalidation de l'autorité runtime

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Domaine** : Autorité, missions, permissions, révocation, P1 L02

## Contexte

Les contrôles de lancement vérifient déjà l'autorité de mission, le tenant,
Cedar, les capacités et les leases d'outils. La provenance runtime de l'ADR
0351 fournit un run et un contrat vérifiables. Les frontières de publication
et les effets locaux doivent partager une référence immuable aux permissions
effectives. Un enfant silencieux peut continuer après une révocation.

## Décision

Le bootstrap scelle `genos.execution-authority-envelope/v1` dans le journal
GVX existant après création du run et de sa capsule. Le record relie mission,
run, binding de provenance, tenant, identité persistée, racine résolue,
plafond d'outils, capacités, hash du plan et limites du run. Le délai est
borné par le budget de latence et le timeout. Une admission répétée ne le
renouvelle pas. Aucun magasin parallèle d'autorité n'est créé.

La génération et l'empreinte du token d'autorité sont conservées lorsque
la réservation existe ; le token brut ne figure pas dans l'enveloppe.
Une mission historiquement sans réservation conserve `lease: null` :
sa lecture ne prétend pas disposer d'un token d'actuation. Les runs sans
mission ou tenant complet restent `legacy_unbound`. Ce statut n'atteste
aucune autorisation nouvelle ; leurs contrôles historiques continuent.

La revalidation lit l'enveloppe et sa chaîne, puis les données actuelles :
identité, scope, membership, mission active, génération/token, statut de
quarantaine et autorité épistémique du lignage. Un changement ou une
expiration ferme la frontière. Une référence fournie par le candidat ne
peut pas élargir la liste d'outils ni remplacer la racine scellée.

Les parcours suivants invoquent ce contrôle commun :

- lancement déterministe, local ou supervisé ;
- application d'une proposition de code locale après génération ;
- outils issus des décisions d'orchestration ;
- progression et publication des runs, reprise des observations comprise.

La progression vérifie et écrit dans une transaction SQLite. Une tentative
de succès refusée devient `AGENT_HALTED` et conserve coût observé et code
de refus ; le reçu biologique constate le run bloqué. Les événements de
défaillance restent enregistrables après révocation. Un reçu antérieur
reste historique et un rejeu déjà appliqué n'est pas réécrit a posteriori.

Un monitor vérifie l'autorité toutes les secondes et demande l'arrêt d'un
enfant silencieux. Ce sondage ne garantit pas un arrêt en temps réel : la
charge et l'arrêt de processus peuvent prolonger le délai.

## Vérification et limites

`test_mission_authority_envelope` utilise SQLite et un vrai processus Node.
Il couvre restart, admission répétée sans prolongation, identité ou tenant
modifié, plafond d'outils, racine modifiée, membership retiré, mission dormante,
quarantaine et révocation épistémique du parent, rotation de token, expiration,
publication refusée, rejeu et arrêt d'un enfant silencieux.
Une sonde à deux connexions réserve la publication réelle pour vérifier que
la rotation attend son commit. Les refus sont également transmis aux
consommateurs ; une tentative de succès refusée ne devient pas une mémoire
de succès ou une décision d'orchestration acceptée.
Le lecteur des consommateurs et des manifestes affiche l'enveloppe et son
autorisation actuelle séparément de `postconditions: not_evaluated` ; une
inspection dans un scope étranger est refusée. L'inspection n'accorde aucun
droit nouveau et conserve les preuves historiques après révocation.

L'enveloppe n'est pas un confinement OS : un processus arbitraire ne devient
pas incapable de lire hors de sa racine par la seule présence du record.
Le contrôle avant une proposition locale ne rend pas atomiques une écriture
externe et une révocation ultérieure. Un effet déjà produit n'est pas annulé.
Les appels REST/gRPC/MCP directs conservent leurs contrôles existants et
doivent encore être raccordés à ce contexte commun. Les compteurs et limites
de spawn/délégation restent à intégrer. L02 et P1 restent ouverts.
