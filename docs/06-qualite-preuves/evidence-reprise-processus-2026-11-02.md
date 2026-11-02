# EVIDENCE : réfutation et reprise entre processus

- **Statut** : Démonstrateur exécutable, transport IPC local contrôlé
- **Date** : 2026-11-02
- **Portée** : Quatre processus Node, quatre bases SQLite et quatre magasins distincts

## Exécution

Depuis la racine :

```powershell
npm --prefix backend run test:evidence-protocol
```

Le scénario seul se lance avec
`node backend/tests/test_evidence_protocol_process_recovery.cjs`.
Les fichiers et bases temporaires sont supprimés après fermeture des processus.

## Protocole mesuré

Un producteur et trois consommateurs acceptent une affirmation sur un candidat,
sa base, son environnement, un prédicat exécutable et une politique identifiés.
Chaque consommateur accepte une conclusion qui dépend de cette affirmation.
Une requête de promotion sur une autre base est refusée.

Le vérificateur local exécute réellement `node probe.cjs` dans chaque magasin.
Le candidat satisfait le prédicat pour l'entrée initiale `0`. L'entrée externe
`input.json` est déclarée explicitement, sans prétendre être adressée par contenu :
l'acceptation sous politique demeure révocable et ne démontre pas une propriété
universelle sur tous les entiers. Le contre-exemple `-1` fait échouer la même
commande sur le même candidat. Le récepteur reproduit cet échec avant de
valider la réfutation ; il n'exécute aucune commande fournie librement par un
message distant.

Un consommateur est arrêté pour simuler une coupure. Le producteur journalise
la contestation et la réfutation pendant cette interruption. Après redémarrage,
le consommateur reçoit les événements manquants avant toute nouvelle décision
de promotion. Chaque consommateur applique l'invalidation et émet un
`ACK_APPLIED` lié à la révision et à l'application locale persistante.

Les assertions du test exigent :

- quatre PID distincts et trois conclusions dépendantes initialement acceptées ;
- le rejet de reçus sur une empreinte d'artefact, une base, un environnement
  ou un prédicat différent de ceux effectivement vérifiés ;
- une réfutation reproduite par exécution dans les magasins destinataires ;
- trois conclusions invalidées et trois accusés d'application ;
- le refus des promotions dépendantes après application ;
- aucun événement supplémentaire lors du rejeu exact du contre-exemple et de l'accusé ;
- la conservation du refus après un nouveau redémarrage du consommateur.

Le journal antérieur reste consultable. Les autres tests de la suite couvrent
les conflits d'idempotence, reçus mal liés, autorités refusées, transitions
invalides, causalité et verdicts de jury corrélés.

## Limites

Le transport IPC et le registre d'autorité sont fournis par le test. Ce résultat
ne qualifie pas un déploiement réseau, une fédération entre domaines de confiance
ou une implémentation Rust indépendante. La coupure est un arrêt de processus
contrôlé, pas une campagne de pertes de paquets ou de pannes disque.

La reprise applique les révisions avant les promotions. Le journal local seul
ne peut pas connaître une réfutation encore distante ; un adaptateur réseau
doit imposer une barrière de synchronisation et une politique de fraîcheur.
Ce chantier ne branche pas automatiquement ce service sur tous les gates de
promotion historiques de GenOS.

Un `ACK_APPLIED` est une déclaration authentifiée par l'adaptateur et liée à
l'état de ce récepteur ; ce n'est pas une preuve cryptographique indépendante
de l'état d'une autre machine. Les garanties de
[EVIDENCE](../03-reference/protocole-evidence.md) et du
[jury](../03-reference/evidence-jury.md) restent distinctes de la livraison.
