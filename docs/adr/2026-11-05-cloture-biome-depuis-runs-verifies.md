# Clôture Biome depuis les runs vérifiés

- Statut : accepté
- Date : 2026-11-05

## Contexte

Le dispatch Biome disposait d’un adaptateur de clôture spécialisé et d’un
contrat de reçu d’oracle signé, mais son appliqueur retournait `APPLIED` sans
faire progresser la session écologique. Les vagues ne conservaient que leurs
deux premiers membres et le dispatch direct remplaçait les métadonnées sans
conserver le lien de session.

## Décision

L’appliqueur exige tous les rôles de la composition et des identités de runs
distinctes et persistées. Il relit les bindings, observations et reçus
biologiques de ces runs, leur budget, leur appartenance à la mission et à la
session. Il recharge ensuite les attestations natives et leurs acceptations,
puis vérifie les preuves de complétion historiques contre les enveloppes et
les sujets scellés. Un simple artefact syntaxiquement valide ne suffit pas.

Ces données alimentent deux cycles écologiques persistés. Le premier colonise
les niches correspondant aux workers réels. Le second enregistre une fitness
binaire d’acceptation des résultats et fait évoluer le focus vers leur
conservation avec leurs références de preuve. Cette mesure ne représente ni
une amélioration quantitative d’algorithme, ni une consommation écologique
mesurée : les coûts d’exécution restent dans les reçus des runs.

L’oracle de clôture relit les mêmes preuves avant de signer le sujet terminal
avec l’autorité indépendante existante. L’adaptateur Biome vérifie ensuite
l’écosystème, la fitness, l’adaptation, le reçu signé et le sceau transactionnel
de session avant de fermer la mission. L’oracle agrège les contrats assignés ;
il ne certifie pas des faits ou objectifs absents de ces contrats.

Le budget enfant conserve les plafonds explicites du parent, les allocations
du membre et les alias camelCase/snake_case. Une allocation invalide ou
supérieure au parent échoue. Le dispatch Biome répartit les plafonds de tokens
et de coût entre tous les membres requis ; chaque worker ne reçoit plus la
totalité du budget collectif. Les valeurs Windows invalides ne sont plus
remplacées par des plafonds fictifs. Le choix du runtime respecte l’exécuteur
demandé. Un PID nul après terminaison ne constitue pas une preuve d’absence
d’exécution ; les runs et leurs observations font autorité.

Les cellules sans corrélation explicite réutilisent le service d’épisode et
le tenant du workspace. Elles n’inventent pas un tenant local et ne masquent
pas les erreurs de persistance.

L’import ADN est mémorisé par connexion de base après réussite et reste
réessayable après désactivation, catalogue vide ou échec. `GENOS_AGENT_DNA=1`
reste nécessaire pour activer le catalogue. Les génomes biologiques des runs
et les génomes cognitifs `.dna` de `agent_genomes` sont deux objets distincts ;
la réussite d’un worker natif ne suffit pas à fabriquer un génome cognitif.

## Vérification

`test_biome_dispatch_completion.js` lance quatre workers natifs réels
(deux scouts et deux specialists), puis contrôle les budgets, les reçus
d’oracles indépendants et la session clôturée en SQLite. Il refuse un run
étranger. Les tests des cellules, des budgets, des artefacts et de l’import
ADN couvrent également les chemins de refus et de reprise.
