# ADR 0539 — Exposer le contrôle coopératif des cellules

- **Statut** : Accepté pour le contrat backend ; runtime enfant à qualifier
- **Date** : 2026-10-15
- **Domaine** : orchestration, IPC, Studio, inspection
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0535 — Reprendre et contrôler les cellules par preuves persistées

## Contexte

L'ADR 0535 a établi les checkpoints et les commandes opérateur persistés, mais
la pause, la reprise et la restauration restaient sans protocole runtime. Les
opérations n'étaient pas non plus accessibles par une API Studio dédiée. Une
interface managée doit conserver la règle épistémique de GenOS : accepter une
requête ou réussir son transport ne prouve pas que la cellule a appliqué
l'action.

## Décision

Le backend définit un protocole IPC coopératif versionné. Chaque requête porte
un `requestId` aléatoire, l'action, un délai borné et la lignée complète :
worker, mission, épisode, thread, organisation et projet. Une réponse ne vaut
preuve que si elle reprend le même identifiant, la même action et la même
lignée, déclare explicitement le succès et fournit un code de preuve borné.
Une absence d'IPC, un délai, une fermeture, une erreur d'envoi ou une divergence
produit un résultat négatif.
Le code de preuve suit un alphabet d'identifiant restreint. Le détail et les
champs supplémentaires fournis par l'enfant ne sont ni retournés ni persistés.

La reprise d'un checkpoint transmet au processus exact le contexte déjà borné,
sa taille, ses références de preuve et les empreintes du contexte et du
checkpoint. L'accusé ne recopie que l'identité du checkpoint et ses empreintes.
Le service persistant vérifie ensuite cette preuve avant toute transition du
`CellThread`. L'annulation demande d'abord l'accusé coopératif puis exige aussi
la fermeture observée du processus.

Studio expose des routes authentifiées sous la lignée exacte d'une cellule
pour sceller, lire et reprendre un checkpoint, demander `pause`, `resume` ou
`cancel`, et relire une commande. Le worker est toujours résolu depuis le
`CellThread` persistant. L'acteur d'une commande provient exclusivement d'une
clé d'accès backend active. Toutes les mutations managées exigent une telle
clé et `workspace:write` ; `cancel` exige en plus `emergency_kill`. Une clé
d'idempotence non vide et bornée est obligatoire. Une mutation ne répond
positivement qu'avec une preuve de reprise ou un reçu final `applied` qui ne
demande aucune réconciliation.

L'inspection d'épisode ajoute deux pages bornées à 100 éléments : checkpoints
avec reprises, et commandes avec reçus. Les jointures utilisent la portée
persistée complète lorsque le schéma la contient. Aucun contexte, jeton,
propriétaire de lease, empreinte de requête ni preuve de reprise n'est exposé.
L'intégrité des reçus opérateur n'étant pas recomputée dans cette vue, elle est
annoncée comme inconnue et la section comme incomplète. Les états en attente et
les réconciliations restent visibles sans être promus en succès. Les reçus non
revalidés restent indéterminés, et les métadonnées d'épisode et de thread sont
filtrées récursivement avant exposition.

## Conséquences

### Positives

- Les réponses concurrentes ne peuvent pas satisfaire une autre requête.
- Le tenant, la mission, l'épisode, le thread et le worker sont revérifiés à
  chaque frontière.
- L'API Studio ne permet pas au corps HTTP de forger le worker ou l'acteur.
- Les lectures d'inspection restent bornées, seules et honnêtes sur leur niveau
  d'intégrité.

### Limites

- Aucun runtime enfant actuel n'implémente encore ce protocole. Les processus
  locaux et externes échouent donc fermement pour ces actions jusqu'à l'ajout
  d'un handler capable de prouver un safe point et de restaurer le contexte.
- Le canal IPC concerne les processus enfants locaux. Un runtime distant devra
  fournir un transport authentifié avec les mêmes invariants.
- Le contexte est filtré et borné lors du scellement, mais sa validité
  sémantique demeure la responsabilité du producteur.
- La vue d'inspection relie un reçu opérateur par sa clé étrangère
  `command_id`; la lecture détaillée d'une commande reste le point qui
  revalide son empreinte cryptographique.

## Preuve d'intégration

Les tests couvrent les accusés exacts et divergents, les requêtes concurrentes,
les délais et fermetures IPC, le nettoyage des listeners, la transmission du
contexte borné, l'annulation avec fermeture observée, les portées croisées,
l'idempotence, les privilèges HTTP, le refus des sessions pour les mutations
managées, les lectures sans écriture, la pagination et l'absence de données
sensibles dans l'inspection.

## Alternatives

- Considérer `child.send()` comme une preuve : écarté, car il atteste seulement
  la remise au canal IPC.
- Autoriser le client HTTP à choisir le worker ou l'acteur : écarté, car ces
  identités doivent provenir de l'état authentifié et persistant.
- Présenter les reçus de l'inspection comme vérifiés sans recomputer leur
  empreinte : écarté, car cela inventerait un niveau de preuve.
