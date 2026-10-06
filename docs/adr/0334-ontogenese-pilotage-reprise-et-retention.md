# ADR 0334 — Ontogenèse : pilotage opérateur, reprise et rétention vérifiables

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Orchestration résidente, contrôle, persistance, exploitation
- **Décideurs** : maintenance GenOS
- **Lié à** : ADR 0235, ADR 0238

## Contexte

Le cycle d'exécution et d'intégration existait, mais plusieurs raccords empêchaient
son utilisation durable : `resume` produisait un réveil que `WAITING_INPUT`
n'acceptait pas ; le tick ne consommait pas l'inbox ; une tâche bloquée pouvait
encore être intégrée ; une pause perdait aussi les candidats déjà vérifiés.
Les commandes d'alimentation du backlog et de conversation n'étaient pas exposées.
La boucle écrivait chaque tick, même sans changement, et les capsules n'étaient
pas collectées.

## Décision

L'inbox est sélectionnée par lots de 100 puis appliquée avec une transaction par message. Chaque message produit
une mémoire avec provenance avant d'être marqué appliqué. Une priorité ne peut
modifier qu'une tâche du même projet. Un message malformé est rejeté et notifié ;
une erreur de stockage est propagée pour conserver le message en attente.
Le contexte opérateur transmis au worker contient au plus 20 mémoires tronquées
à 2 000 caractères. Il ne modifie pas l'autorité.

Les intentions `start` et `resume` produisent `user_reply`. Les phases d'exécution
persistées réconcilient `PLANNING` et `IDLE` avant un nouveau dispatch. Les pauses
et le sommeil conservent les exécutions `finished` et `verified`, avec leurs
réservations. Les exécutions encore actives sont arrêtées suivant le contrat
existant. Une tâche bloquée entraîne l'arrêt et la clôture de son exécution avant
toute vérification ou intégration. `STOPPED` reste terminal.

La boucle résidente possède une attente interruptible, vérifie ses paramètres et
n'émet un état que lorsqu'il change. Ses gestionnaires de signaux sont retirés
en `finally`. L'autostart élimine la virgule présente dans la valeur JSON de
contrôle avant de comparer la pause persistée. Le claim du tick est porté à
120 secondes et renouvelé toutes les 10 secondes, avec le fencing existant.
Un détenteur ayant perdu son claim ne continue pas silencieusement. La compilation
locale de la mission est réalisée avant l'acquisition du claim, puis réutilisée
pour le backlog et le plan. L'empreinte du projet est relue sous claim : un
changement de configuration conduit à un nouveau tour, sans dispatch obsolète.
Les événements effectivement observés sont acquittés pour éviter qu'une vieille
réponse réveille une attente ultérieure. Les échecs worker ont des réessais bornés ;
leur clôture, leur tentative, leurs dépenses et leur mémoire sont transactionnelles.

Les commandes `task`, `tasks`, `message`, `priority`, `budgets`, `event`,
`notifications` et `ack` exposent les opérations locales. Une modification de
plafond exige une raison, est tracée et ne remet jamais les dépenses à zéro ;
elle est refusée pendant une exécution ou un claim actif. La création du projet
et de son contrôle est atomique.

`prune --artifacts` collecte au plus 100 exécutions terminales par passage,
après délai configuré. Le claim est renouvelé en cours de collecte et contrôlé
juste avant chaque suppression. Les requêtes sont confinées au répertoire géré. Une
capsule n'est supprimée que si elle possède une empreinte vérifiée persistée
et si son contenu correspond encore à cette empreinte. Les chemins symboliques,
externes, les opérations actives et les contenus modifiés sont conservés.
La suppression passe par `git worktree remove`, sans purge générique de dossier.
Les lignes d'exécution, les reçus, les budgets et les SHA restent persistés.

La suite dédiée découvre tous les fichiers `test_ontogenesis_*.js`, puis les
tests de raccord SHEV et philosophiques. Les anciens tests exclus du script npm
font ainsi partie de la validation habituelle. Les sept scénarios de complétude
sont exécutés dans des processus distincts, chacun borné à cinq minutes, pour ne
pas additionner les coûts Git et SQLite dans une seule échéance de test.

## Conséquences

### Positives

- Les instructions opérateur restent consultables et sont appliquées une fois.
- Une reprise ne recrée pas un worker pour une exécution déjà persistée.
- L'arrêt d'une tâche et la pause d'un candidat vérifié ont des parcours distincts.
- L'exploitation expose les opérations nécessaires sans édition directe de SQLite.
- Les preuves, les données humaines et l'autorité demeurent protégées.

### Négatives

- Les pauses ne prolongent pas le budget temporel : un candidat ancien peut expirer.
- Les capsules non vérifiées ou modifiées sont conservées pour investigation.
- Le contrôle RAM reste une mesure et une admission ; ce n'est pas une limite
  matérielle instantanée de l'arbre de processus Windows.
- Les tests injectent un worker et exécutent réellement SQLite, les contrôles et
  Git. Ils ne prouvent ni une mission avec fournisseur externe ni la continuité
  d'une machine locale éteinte.

## Alternatives

- Repartir du backlog après toute pause : rejeté, car cela duplique le travail
  déjà vérifié et consomme une nouvelle réservation.
- Appliquer les messages seulement dans le CLI : rejeté, car les autres processus
  et canaux utilisent la même inbox persistante.
- Supprimer les capsules par âge seul : rejeté, car cela efface des preuves ou des
  modifications humaines sans contrôler leur état.

## Vérification

`npm --prefix backend run test:ontogenesis`,
`backend/tests/test_ontogenesis_completion.js` et le gate qualité du dépôt.
Les résultats d'exécution doivent être consultés séparément : la présence de cette
ADR n'atteste pas la réussite des validations globales d'un checkout modifié.
