# ADN et clinique avant l'exécution des workers topologiques

- **Statut :** accepté, raccord Node natif implémenté.
- **Date :** 2026-11-04.
- **Portée :** démarrage des workers Node et parcours Windows natif.

## Contexte

Le parcours A-Team matérialise les identités par `ensureTopologyWorker` puis
délègue leur lancement. Cette matérialisation conserve le contrat mais n'appelle
pas l'incarnation de flotte. Un worker pouvait donc démarrer sans expression
d'un génome `.dna` et sans état clinique. Le génome de contrat de
`biologicalWorkerStore` n'est pas une preuve d'utilisation d'AgentDNA : il lisait
une propriété `dna_json` absente du schéma des agents.

## Décision

L'admission du runtime initialise et contrôle réellement l'état clinique avant
la création du run. La surveillance immunitaire existante peut refuser le
lancement ; une quarantaine n'est pas transformée en état sain. Le parcours
Windows applique la même préparation avant sa création de run et son scellement.

Avec `GENOS_AGENT_DNA=1`, un worker cognitif doit disposer d'une sélection
AgentDNA admissible. Il utilise les services de sélection existants, dans le
tenant du worker et de son parent. L'affectation peut préciser
`workerAssignment.genomeRef`. Une sélection absente est refusée avec
`WORKER_DNA_REQUIRED` ; aucun génome synthétique n'est créé pour satisfaire
l'option. La sélection durable référence désormais l'identité du worker réel.

`metadata_json.dnaIncarnation` conserve une liaison HMAC : worker, parent,
tenant, référence et empreinte du `.dna`, expression et référence de sélection.
Le démarrage relit les octets du génome, son statut actif, son empreinte et sa
confiance selon la politique de signature courante. Une substitution, une
révocation, une source étrangère ou une sélection sans trace durable est refusée.
Une liaison déjà présente est contrôlée même si l'activation automatique est
ensuite désactivée.

L'hydratation existante applique le phénotype au prompt, aux paramètres de
sampling et à l'intersection de la lease d'outils. Une expression de lignée
différente de la source ADN admise provoque un refus. Le hash de la liaison ADN
est scellé dans l'autorité d'exécution, en plus de celui des gènes exprimés.
La liaison voyage dans le champ JSON de génome déjà prévu par le protocole ;
aucun champ protobuf ou privilège supplémentaire n'est introduit.

Le binding biologique du run photographie la liaison vérifiée réelle. Auteur,
consommateur et remplaçant A-Team empruntent ce même démarrage. Un candidat
dormant ne prouve aucune exécution ; sa liaison ne devient une preuve de run
qu'après son lancement effectif.

L'admission clinique conserve également un reçu HMAC lié au worker, à la mission,
au tenant, au véritable événement de surveillance et à son état clinique. Son
empreinte entre dans l'enveloppe d'autorité et dans le binding biologique du run.
Chaque usage de l'autorité revalide la source, l'échéance et les quarantaines
postérieures au scan. Une remise en activité ne réhabilite pas l'ancien reçu.
La lecture historique vérifie l'état à la date du scellement sans effectuer
un nouveau scan ni autoriser une nouvelle exécution.

## Conséquences

L'activation ADN est explicite et exige un répertoire réellement adapté aux
affectations. Les politiques de signature restent applicables ; elles ne sont
pas désactivées pour permettre une mission. L'état clinique est créé et examiné
pour chaque démarrage, y compris lorsque l'ADN automatique est désactivé.

Le raccord ne prétend pas qu'un génome améliore la rédaction, ni que toutes les
pathologies ont été rencontrées. Il ne remplace pas les contrats de worker,
les preuves d'exécution ou les gates de promotion. Il n'ajoute aucun lien
symbolique entre un fichier `.dna` simplement présent et une exécution.

## Validation

`test_topology_worker_incarnation.cjs` utilise les vrais services avec SQLite.
Il prépare auteur, consommateur et remplaçant, vérifie l'expression, le
transport protobuf, la sélection spécifique à l'agent et la capture biologique.
Il refuse une liaison modifiée, une source révoquée, une confiance de signature
insuffisante, un autre workspace et un génome explicite absent. Une pathologie
observée par la vraie surveillance bloque le lancement et arrête le cycle
cellulaire. Le test n'appelle aucun LLM et ne mesure aucun gain artistique.

## Alternatives

Ajouter un simple indicateur `dnaUsed` ou remplir un objet biologique à partir
du brief est écarté : cela ne prouve aucune lecture ni expression d'ADN.
Rappeler l'incarnation de flotte entière aurait changé identité, workspace et
allocations déjà préparés par l'A-Team. Le raccord réutilise ses services
canoniques de sélection et d'expression au moment du démarrage autorisé.
