# ADR 0532 — Cicatriser les épisodes orphelins sans inventer de succès

- **Statut** : Accepté pour le runtime backend local
- **Date** : 2026-10-15
- **Domaine** : orchestration, reprise après crash, provenance
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0523 — Unifier épisode, cellule, habitat, métabolisme et membrane

## Contexte

Un arrêt brutal du superviseur peut laisser un épisode et ses `CellThreads` dans
un état actif alors que leur processus propriétaire ne produit plus de preuve.
Le seul statut actif ne suffit pas à conclure à un crash : le processus peut
encore vivre, un nouveau runtime peut avoir repris l'agent, ou le run observé
peut appartenir à une autre exécution.

Une reprise qui transformerait cette ambiguïté en réussite violerait la règle
épistémique du runtime. La cicatrisation doit donc isoler la lignée interrompue,
conserver ses preuves et laisser une promotion éventuelle à un autre mécanisme.

## Décision

Lors du lancement d'un runtime externe, l'épisode actif est lié aux valeurs
persistées suivantes : organisation, projet, mission, agent orchestrateur, run
d'exécution exact, génération et empreinte du jeton d'autorité, PID du processus
propriétaire et PID du runtime enfant. Le backend lit ces valeurs depuis ses
tables d'autorité, de runs et d'agents. Un appelant ne fournit pas les PID ni la
preuve d'autorité.

Au démarrage de `genos-orchestrate`, le backend examine les épisodes actifs qui
possèdent cette liaison. Il ne déclare un épisode orphelin que si :

- la portée organisation/projet et la mission correspondent à l'épisode ;
- l'agent, le run, la génération, le PID propriétaire et l'empreinte du jeton
  correspondent encore à l'autorité persistée ;
- le run porte un état interrompu ou encore actif ;
- ni le PID propriétaire lié, ni le PID runtime lié ne sont vivants ;
- aucun PID runtime différent n'est désormais attaché à l'agent.

Un PID vivant, un refus système de confirmer sa mort ou un runtime remplaçant
laissent l'épisode intact. Une divergence de run ou d'autorité arrête la reprise
sans mutation.

La cicatrisation s'effectue dans une transaction SQLite unique. Elle :

1. met en quarantaine les threads embryonnaires, prêts, actifs ou en attente ;
2. marque l'épisode actif en échec ;
3. marque le run planifié ou actif en échec et l'autorité en échec ;
4. écrit un reçu immuable `interrupted_quarantined` avec les états observés et
   le nombre de threads mis en quarantaine.

Le reçu possède un identifiant déterministe dérivé de l'épisode, du run et de
la génération d'autorité. Une répétition exacte retourne le même reçu sans
modifier de nouveau les révisions. Aucun chemin de récupération ne produit les
états `completed` ou `completed_execution`.

## Conséquences

### Positives

- Un redémarrage du contrôle plane ferme durablement une lignée dont les deux
  processus persistés sont morts.
- Le reçu permet d'inspecter l'identité du propriétaire et les états constatés
  au moment de la récupération.
- La transaction évite un épisode échoué avec des threads encore actifs ou un
  reçu écrit avant la mutation correspondante.
- L'idempotence rend la réconciliation répétable après plusieurs redémarrages.

### Négatives et limites

- La vérification locale des PID ne prouve pas une identité de processus entre
  plusieurs hôtes. Le mécanisme est qualifié seulement pour le backend local.
- Un PID recyclé ou impossible à sonder bloque la reprise par prudence, même si
  l'ancien runtime est probablement mort.
- Les runtimes en processus interne qui ne fournissent pas de PID enfant ne
  reçoivent pas cette liaison et ne sont pas cicatrisés par ce parcours.
- La quarantaine ne relance pas le travail et ne promeut aucun résultat. Une
  nouvelle exécution exige une autorité et un run distincts.
- Le service n'établit pas la vérité sémantique des sorties produites avant le
  crash ; il conserve uniquement la preuve d'interruption observée.

## Preuve d'intégration

`node --test backend/tests/test_mission_episode_recovery.js` couvre :

- la conservation d'un épisode lorsque le propriétaire est vivant ;
- la cicatrisation automatique d'un run orphelin ;
- la transaction qui échoue le run et l'épisode et met les threads en
  quarantaine sans état de succès ;
- le retour idempotent du reçu et son immutabilité ;
- le rollback complet lorsque l'écriture du reçu échoue ;
- le refus d'une portée tenant ou d'une autorité divergente ;
- le refus de récupérer une ancienne liaison lorsqu'un runtime remplaçant est
  attaché à l'agent.

La suite combinée avec les tests d'épisode et de `CellThread` passe 13 tests sur
13. Le contrôle `python scripts/ci/check_code_quality.py` ne relève aucune
nouvelle violation.

## Alternatives

- Déduire le crash du seul statut actif : écarté, car un processus vivant serait
  mis en quarantaine.
- Utiliser le dernier run de l'agent : écarté, car il ne prouve pas son lien avec
  l'épisode observé.
- Reprendre les threads directement en état actif : écarté, car leur contexte
  et leurs effets après le crash ne sont pas prouvés.
- Marquer la lignée comme terminée avec succès : écarté, car l'interruption ne
  constitue pas une preuve d'exécution valide ni de promotion.
