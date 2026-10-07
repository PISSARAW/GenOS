# ADR 0348 — Studio modulaire et parcours opérateur

**Statut** : Accepté
**Date** : 2026-10-07
**Domaine** : Studio, contrats, exploitation et preuves

## Contexte

Le client de référence inspecte un run et ses preuves. Les API de télémétrie,
d'administration et d'expérimentation existent séparément. Leur présence ne
qualifie pas un parcours navigateur. Le checkout opérateur contient des travaux
concurrents ; cette évolution part du commit b7e39894 dans un worktree isolé.

## Décision

Conserver un client statique servi sous `/studio/`, organisé en modules natifs
JavaScript sans ajouter de chaîne de compilation. Chaque vue utilise le client
HTTP commun et une session en mémoire. Tout changement de scope annule les
requêtes et abonnements précédents, puis efface les données.

Le flux SSE utilise fetch pour transmettre Authorization et le tenant dans les
headers. La reconnexion recharge l'état autoritatif ; la fenêtre récente du
serveur ne promet pas un historique complet. Les métriques absentes restent
inconnues ; les estimations et mesures portent des libellés distincts.

L'éditeur utilise des chemins confinés, une version SHA-256 et une écriture
conditionnelle. Les actions de promotion conservent leurs preuves et signatures.
L'arrêt runtime vérifie les processus gérés. Le redémarrage est une demande au
superviseur propriétaire, avec contrôle de disponibilité après nouvelle instance.
Un processus externe non identifié n'est jamais déclaré arrêté.

Le superviseur natif démarre un seul propriétaire SQLite/runtime plutôt que le
pool cluster historique. Une demande admin confirmée ferme les admissions,
vérifie les missions suivies et persiste une référence d'opération avant l'IPC.
Le drainage IPC fonctionne également sous Windows. Un arrêt forcé ou en erreur
ne provoque pas de redémarrage déclaré réussi. Le client exige une instance
différente, prête et capable de relire l'opération persistée.

La matrice des huit lots et les critères d'acceptation sont conservés dans
[le contrat Studio](../03-reference/studio-parcours-et-acceptation.md).

## Conséquences

Chaque lot dispose d'un commit et de tests adaptés. Les nouvelles interfaces
respectent les gates existants et les limites de qualité du dépôt. Les preuves
générées et les secrets restent hors Git. La qualification d'une plateforme
exige son exécution réelle ; une preuve Windows ne qualifie pas Linux.

## Alternatives

- Réécrire le Studio avec un framework : migration et dépendances inutiles pour
  les parcours ciblés.
- Brancher directement les vues sur les réponses brutes : ne traite pas les
  courses de session, les erreurs et les permissions de façon cohérente.
- Déclarer la présence des API comme preuve E2E : contraire au contrat produit.
