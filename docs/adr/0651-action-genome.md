# ADR 0651 — ActionGenome comme contrat canonique d’action

## Statut

Accepté.

## Contexte

Les surfaces REST, CLI et MCP décrivent aujourd’hui leurs actions avec des contrats distincts. Une réussite de transport ne prouve ni l’autorité de l’acteur, ni la validité de l’état lu, ni l’obtention des preuves attendues. Dériver une nouvelle surface directement d’un schéma d’entrée masquerait aussi les effets, budgets et conditions de compensation.

## Décision

GenOS introduit `genos.action-genome/v1`, un contrat déclaratif et fermé qui réunit :

- identité et version de l’action ;
- schémas d’entrée et de sortie ;
- préconditions et postconditions sans code exécutable ;
- chemins d’état lus et écrits, et effets déclarés ;
- permissions et leases nécessaires ;
- budget temporel et coût maximal ;
- réversibilité, rayon d’impact et éventuelle action compensatrice ;
- preuves attendues.

La validation rejette les champs d’autorité inconnus et toute section obligatoire absente. Le contrat ne confère aucune autorité et n’exécute aucune action. Une projection de surface ne sera annoncée comme câblée que si une liaison vérifiable vers une surface existante est fournie.

Une invocation évaluée produit un reçu causal distinct. Ce reçu lie l’acteur, la version d’état observée, le contrat exact et le verdict d’admission. Il ne constitue jamais une preuve d’effet ni un rollback.

## Conséquences

- Les surfaces peuvent partager un vocabulaire sans partager implicitement leurs permissions.
- Les intégrations incomplètes restent visibles comme descriptives.
- Les actions existantes peuvent migrer progressivement vers ce contrat.
- Les restaurations Syncytium et A2A restent hors périmètre tant qu’elles ne sont pas implémentées et vérifiées.
