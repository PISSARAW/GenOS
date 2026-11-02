# CONTINUITY : migration et clôture des anciennes incarnations

- **Statut** : Démonstrateur exécutable, processus et bases séparés
- **Date** : 2026-11-02
- **Portée** : Ancien runtime, successeur et ressource autoritative en trois processus Node

## Exécution

Depuis la racine :

```powershell
npm --prefix backend run test:continuity-protocol
```

Le scénario seul se lance avec
`node backend/tests/test_continuity_protocol_process_recovery.cjs`.
Chaque processus dispose de son propre répertoire et de sa base SQLite.
Les magasins de checkpoints des deux runtimes sont distincts.
Les fichiers temporaires sont supprimés après fermeture des processus.

## Protocole et assertions

L'ancienne incarnation effectue une première écriture autorisée à la génération 1.
Elle offre un transfert et scelle un checkpoint contenant l'histoire référencée,
une obligation ouverte, une preuve et une opération dont l'issue reste inconnue.
Le paquet affecte explicitement l'obligation et l'opération inconnue au
successeur, conserve les droits effectifs et les dépenses, et préserve la réserve.
L'adaptateur de confiance vérifie le fichier de checkpoint et le paquet exact.

Après arrêt de l'ancien processus, sa base scellée et son journal WAL disponible
sont copiés vers le répertoire du successeur. Les deux runtimes redémarrent avec
des états locaux séparés. La ressource refuse une écriture du successeur avant
l'activation : copier le checkpoint et connaître l'identité ne suffit pas.

Le transport de l'ancienne incarnation est alors coupé dans le courtier IPC.
Le successeur accepte le paquet scellé et commence son activation. La ressource
vérifie l'ancien propriétaire, la génération, les droits et le budget courant,
puis passe atomiquement à la génération 2. Une intention locale
`activation_pending` précède cet effet.

Le test arrête le successeur immédiatement après la réponse de la ressource et
avant la confirmation dans son journal local. Il redémarre aussi la ressource.
Le successeur retrouve son intention en attente et reprend la même activation.
La réponse idempotente permet de confirmer le journal sans incrémenter une
seconde fois la génération ni recréditer le budget.

Après reconnexion, le test exige :

- le refus de l'ancienne incarnation pour une nouvelle écriture ;
- le refus du rejeu de sa première écriture après perte d'autorité ;
- le refus d'un ancien canal qui déclare l'identité du successeur ;
- le refus d'un coût nul choisi par le client pour contourner le barème ;
- une écriture valide du successeur, appliquée une seule fois malgré le rejeu ;
- exactement deux effets persistants, l'un avant et l'autre après le transfert ;
- une autorité de génération 2, les dépenses cumulées et la réserve conservées ;
- la conservation de l'obligation, de son responsable, des preuves et de l'effet inconnu.

Les autres tests de la suite couvrent le contrat versionné, les nonces durables,
les attestations liées à leur contexte, les restaurations sans effacement
d'histoire, la non-transmission implicite de droits lors d'un fork, les conflits
d'idempotence, les courses de révocation et les transactions d'effets.

## Frontière de confiance et limites

Le courtier du test identifie les processus par leurs canaux IPC et injecte ce
principal dans l'autorisation côté ressource. Les identités déclarées dans les
commandes ne remplacent pas cette authentification. Le coût autorisé de chaque
écriture est fixé par la politique du test, pas par le client.

Le contrôle de génération et l'écriture de la ressource clé-valeur sont effectués
dans la même transaction SQLite. La base du runtime source et sa copie restent
des vues non autoritatives sur les droits de la ressource.

Le scénario ne constitue pas une qualification réseau entre machines physiques,
une intégration SPIFFE, une preuve cryptographique de continuité ou une nouvelle
implémentation Rust. Le registre d'identité et les autorités historiques de GenOS
restent à raccorder au profil par leurs adaptateurs de confiance. Aucun endpoint
public ou outil MCP supplémentaire n'est ajouté automatiquement.

Les ressources qui ne contrôlent pas la génération à l'application de leurs
effets ne sont pas protégées par ce démonstrateur. L'adaptateur doit traiter
séparément leurs effets ambigus ; le transfert ne prétend pas les annuler.
L'indisponibilité de la ressource bloque les effets au lieu d'utiliser une
ancienne copie locale comme autorisation.

Voir le [contrat](../03-reference/protocole-continuity.md),
la [reconnaissance](../03-reference/continuity-identite.md),
le [transfert](../03-reference/continuity-transfert.md) et
la [ressource protégée](../03-reference/continuity-autorite.md).
