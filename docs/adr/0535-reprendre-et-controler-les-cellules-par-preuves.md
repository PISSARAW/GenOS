# ADR 0535 — Reprendre et contrôler les cellules par preuves persistées

- **Statut** : Accepté pour le runtime backend local
- **Date** : 2026-10-15
- **Domaine** : orchestration, reprise, contrôle opérateur, inspection
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0523 — Unifier épisode, cellule, habitat, métabolisme et membrane

## Contexte

Un `CellThread` suspendu doit pouvoir reprendre après une interruption sans
perdre sa lignée ni transformer un contexte périmé en travail valide. En
parallèle, un opérateur doit pouvoir demander une pause, une reprise ou une
annulation sans que l'acceptation d'une commande soit confondue avec la preuve
que le runtime a obéi. L'inspection doit rendre ces états observables sans
écrire ni inventer une corrélation métabolique.

## Décision

Un checkpoint cellulaire est un enregistrement append-only lié à
l'organisation, au projet, à la mission, à l'épisode, au thread, au worker, à
la révision et à l'état exacts. Le contexte canonique est borné à 256 Kio et son
empreinte SHA-256 est recomputée à la lecture. Les références de preuve sont
bornées. La reprise n'est autorisée que si l'état et la révision n'ont pas
changé. Un adaptateur runtime interne doit ensuite attester l'identité exacte
de la cellule, l'empreinte du checkpoint et l'empreinte du contexte. Après
cette preuve seulement, la reprise lie le checkpoint et la taille du contexte
au thread, produit une nouvelle révision `active` et un reçu immuable contenant
le code et l'empreinte de preuve. Elle ne produit jamais
`completed_execution`.

Le contrôle opérateur sépare deux objets :

1. une commande mutable, réclamée par clé d'idempotence et finalisée par CAS ;
2. un reçu final append-only qui conserve le résultat et les preuves observées.

La portée mission, épisode, thread et tenant est résolue depuis la base.
L'identifiant d'acteur doit désigner une clé d'accès backend active et non
expirée ; l'autorité est dérivée de son rôle persisté plutôt que fournie par la
commande.
Une annulation de processus ne réussit que si le processus actif porte
l'identité exacte du worker, de la mission, de l'épisode et du thread, accepte
l'arrêt et émet sa fermeture. Une pause ou reprise sans accusé coopératif est
rejetée. Les mutations des threads vérifient l'état et la révision observés.

Studio expose les agrégats métaboliques par cellule uniquement pour les couples
thread/worker persistés de l'épisode et de la page consultée. Les observations
legacy ou non corrélables restent comptées séparément. Le reçu de récupération
d'épisode est lu par la clé exacte épisode, mission et tenant. Chaque section
indique explicitement si sa corrélation est exacte, complète ou legacy. Cette
inspection n'exécute aucune migration et ne modifie pas la base.

## Conséquences

### Positives

- Une reprise périmée ou altérée échoue avant toute transition.
- Une commande acceptée ne devient un succès qu'avec une preuve du runtime.
- Les répétitions exactes retournent le même résultat sans doubler les effets.
- L'opérateur voit les cellules, leur métabolisme et la récupération d'épisode
  avec leur niveau réel de corrélation.

### Négatives et limites

- Le contexte du checkpoint demeure opaque ; son intégrité est prouvée, pas sa
  validité sémantique ni l'absence de secret fourni par l'appelant.
- Le contrôle de processus est qualifié pour le backend local. Il ne prouve pas
  l'identité d'un processus sur un autre hôte.
- Une preuve runtime peut précéder la projection SQLite. Si la révision change
  entre les deux, le reçu conserve l'effet observé et signale explicitement
  `CONTROL_APPLIED_RECONCILIATION_REQUIRED` avec les conflits de projection.
- La pause et la reprise exigent un futur protocole coopératif du runtime ; en
  son absence, elles échouent fermement.
- Le service de checkpoint exige un adaptateur runtime interne ; cette vague ne
  lui ajoute pas d'endpoint public.
- Les mesures historiques sans lignée cellulaire restent visibles seulement
  comme données legacy non corrélées.

## Preuve d'intégration

Les suites ciblées couvrent l'immutabilité, les empreintes, l'idempotence, les
collisions, les portées croisées, les révisions périmées, la reprise runtime
refusée ou prouvée, les transitions sans succès inventé, les leases de commande,
les autorités, l'arrêt de processus avec identité exacte et la lecture Studio
strictement seule. Le contrôle qualité du dépôt doit rester sans nouvelle
violation avant promotion.

## Alternatives

- Reprendre depuis le seul identifiant de thread : écarté, car la révision et
  l'état peuvent avoir changé.
- Écrire directement un reçu de commande en attente : écarté, car un reçu final
  doit rester immuable.
- Déclarer une annulation dès l'envoi du signal : écarté, car le processus peut
  rester vivant ou appartenir à une autre lignée.
- Rattacher les mesures legacy à la cellule courante : écarté, car cette
  corrélation ne possède aucune preuve persistée.
