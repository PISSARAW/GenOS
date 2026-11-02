# OMEGA Execution : effet inconnu et reprise entre processus

- **Statut** : Démonstrateur exécutable du profil expérimental
- **Date** : 2026-11-02
- **Portée** : Client, exécuteur G-CIR Ω et ressource protégée en trois processus

## Exécution

Depuis la racine :

```powershell
npm --prefix backend run test:omega-protocol
```

Le scénario seul se lance avec
`node backend/tests/test_omega_protocol_process_recovery.cjs`.
Les processus ont des bases SQLite et des magasins temporaires distincts.
Le client conserve son outbox ; l'exécuteur conserve admission, journal natif
et intentions d'effets ; la ressource conserve valeur, budget et reçus.

## Programme et admission

Le programme emploie le contrat existant `genos.gcir.omega/v1` et son empreinte
MessagePack réelle. Le profil d'exécution l'entoure avec une identité, une
portée, des générations, une politique, un budget, une base et un environnement.
L'admission appelle les descripteurs de confiance des handlers installés et
conserve toutes les obligations du programme :

`READ → SELECT → CHECK → EMIT`

Le runtime utilisé est bien
`backend/src/services/cognitiveOmegaRuntimeService.js`, avec son journal
`cognitiveOmegaExecutionJournal.js`. Les étapes ne sont pas remplacées par une
liste de résultats fournie par le client.

`READ` lit un fichier contenant la valeur 7 et une révision de base ; `SELECT`
en extrait la valeur ; `CHECK` exécute le prédicat local installé ; `EMIT`
transmet seulement le candidat lié à cette vérification. Aucun handler
d'inférence n'est installé ou demandé par ce programme mécanique.

Le test refuse un programme demandant un vérificateur absent. Il modifie aussi
la base locale après admission et vérifie le refus d'exécution avant tout
appel de handler. Les données d'environnement déclarées sont confrontées à la
version réelle de Node et à la révision installée des handlers.

## Coupure entre effet et reçu

La ressource autorise une écriture selon un tarif installé, vérifie le candidat,
contrôle l'acteur et la génération, puis écrit la valeur, le reçu et le débit du
budget dans une même transaction. La clé d'effet et son empreinte complète
permettent une déduplication effective au destinataire.

Le test suspend l'exécuteur après la réponse de cette ressource mais avant
l'enregistrement du reçu dans son propre journal. Il arrête alors le processus.
À la réouverture, l'intention en attente devient `effect_outcome_unknown`.
Le rapport d'obligations conserve les quatre étapes et indique explicitement
l'issue inconnue de l'effet, sans annoncer une exécution terminée.

La ressource est ensuite arrêtée. Une réconciliation pendant cette interruption
reste inconnue et ne renvoie pas l'effet. Après redémarrage de la ressource,
la consultation authentifiée retrouve son reçu durable. L'exécuteur enregistre
ce reçu, puis reprend le programme avec `RESUME`.

Les étapes déjà complétées sont relues dans le journal natif. L'entrée dans le
contrôle d'effet rend le reçu réconcilié sans nouvelle écriture externe. Un
second redémarrage vérifie encore cette conservation.

## Assertions

Le scénario exige :

- trois PID distincts et quatre opérations natives réelles ;
- un seul effet appliqué, malgré la coupure et les reprises ;
- un débit d'une unité et une réserve de deux unités conservée ;
- un seul appel de chacun des handlers `READ`, `SELECT` et `CHECK` ;
- zéro appel d'inférence et zéro réexécution des étapes terminées ;
- aucune completion implicite lors d'une réconciliation indisponible ;
- des obligations complètes et un refus si la base devient inapplicable.

Les autres suites du profil couvrent notamment permissions natives, capacités
manquantes, variations de génération, autorisations révoquées, propriétaires
concurrents, conflits de clés, reçus altérés, expiration et reprise après
attestation explicite de non-application.

## Limites

Le courtier IPC authentifie les rôles par leurs canaux et limite leurs routes.
L'exécuteur agit pour le client selon une politique de délégation fixée par le
test ; déclarer un acteur dans le payload ne suffit pas. Les preuves et les
autorisations restent des décisions des adaptateurs de confiance.

La garantie d'application unique observée concerne cette ressource SQLite avec
déduplication et reçu atomiques. Le profil ne promet pas une sémantique
« exactement une fois » pour un service externe arbitraire. Une absence de reçu
ne prouve jamais une absence d'effet ; un effet encore inconnu reste bloquant.

Cette campagne ne qualifie pas un réseau réel, une inférence distante facturée,
un endpoint métier ou un nouveau serveur Rust. Le codec G-CIR existant reste
réutilisé ; les handlers, leases, budgets réels et frontières de production
doivent être raccordés explicitement sans contourner les gates existants.

Voir le [contrat](../03-reference/protocole-omega-execution.md),
l'[admission](../03-reference/omega-admission.md),
l'[exécution durable](../03-reference/omega-execution-durable.md) et
les [effets](../03-reference/omega-effets.md).
