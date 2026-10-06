# 0335 — Boucle orchestrator attendue et reçus propriétaires

- Statut : Accepté
- Date : 2026-10-06
- Domaine : orchestration, persistance, preuves et clôture runtime

## Contexte

Des décisions étaient déclenchées depuis l'émission des événements sans attendre
leurs contrôles ni leur exécution. La clôture pouvait libérer le PID avant le
verdict définitif. Les continuations pouvaient ignorer un résultat rafraîchi ou
lancer deux fois la première reprise. Un transport MCP réussi n'est pas une
preuve métier.

## Décision

Le pipeline valide et persiste l'événement, puis attend les effets corporels et
la décision. La récupération spécialisée conserve la responsabilité des échecs
workers. Les événements non décisionnels retournent null.

Une migration additive conserve les reçus existants. Une insertion atomique
réclame la clé historique orchestrator/événement/outil. Le propriétaire reçoit
un UUID, renouvelle son bail de cinq minutes et termine par CAS. Un reçu
différé ou abandonné peut être repris lors d'une nouvelle livraison ; un échec
terminal n'est pas relancé implicitement. Le contexte et le résultat sont
persistés. Ce mécanisme déduplique les tentatives concurrentes ; il ne garantit
pas une transaction exactement-une-fois avec un outil externe après un crash.

Les arguments mémoire suivent le schéma MCP canonique. Les scores explicites
sont classés par la primitive enregistrée rank_states. Un replay exige un reçu
VERIFIED avec execution_replayed ; un snapshot exige un fichier structuré ; une
expérience exige son episodeId. Les chemins de snapshot restent confinés même
en présence de junctions ou de symlinks. La coévolution reçoit un chemin de
manifeste confiné conforme au contrat ; son succès exige un résultat métier
explicite. Un outil absent du catalogue ne produit aucun succès synthétique.

Le PID reste présent jusqu'à la finalisation du verdict et des écritures. Une
barrière de quiescence ne certifie pas la couverture. La première continuation
déjà dispatchée est attendue et compte dans la limite. Chaque réévaluation
remplace le résultat et la mission ; la couverture et la télémétrie finales sont
collectées après les reprises. Un champion n'est mémorisé que si toutes les
gates finales autorisent le succès.

Le corps relit le budget mesuré et le nombre de workers actifs. Les conséquences
sont dédupliquées par identité d'événement pendant la supervision. Les échecs et
la dette de preuve resserrent le contrôle ; un budget épuisé arrête le nouveau
dispatch. Un succès ne rembourse pas une dette indépendante.

L'apprentissage facultatif après rapport et la compilation mémoire après un
reçu d'expérience disposent d'un délai de cinq secondes. Le résultat tardif ne
produit aucun second événement de succès ou d'échec. Un dépassement
produit RUNTIME_LEARNING_DEFERRED sans reçu de mémoire réussi. Les gates de
preuve restent attendues. Le runtime isolé peut ensuite sortir et les rapports
persistés restent disponibles au control plane pour une compilation ultérieure.

## Alternatives écartées

- Déclencher les effets dans emitTracked : ordre et clôture non déterministes.
- Réclamer un reçu avec lecture puis insertion : concurrence non protégée.
- Accepter un succès MCP seul : faux succès pour un résultat métier invalide.
- Relaxer les contrats de preuves/tenant pour faire passer les fixtures :
  perte des garanties existantes.

## Conséquences et validation

Les modules séparés conservent les limites de taille et de complexité.
La suite `npm --prefix backend run test:orchestrator` utilise une base temporaire
par fichier. Elle couvre les reçus SQLite concurrents, le fencing, les
continuations, les preuves typées, le confinement et les frontières gRPC.
Les contrôles globaux restent requis par AGENTS.md.

Cette décision porte sur le control plane Node. Elle ne transforme ni les
capteurs déclaratifs navigateur/IDE en acquisition réelle, ni la simulation
Rust en exécution des workers Node. La reprise des reçus exige une nouvelle
livraison ; aucun balayage automatique permanent n'est introduit.
