# ADR 0295 — Responsabilité persistante et initiatives SHEV

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : projets persistants, perception, Ontogenèse, GVX
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0235, ADR 0272, ADR 0288

## Contexte

L'Ontogenèse conserve déjà le projet, le backlog, les claims, les contrôles et les
intégrations. GVX conserve des événements de développement et propose des cycles
d'expérience. Il manque un contrat qui associe durablement une responsabilité de
qualité du projet à des observations et à des initiatives. Un tick sans tâche
n'implique ni que le projet est sain ni qu'un nouveau travail est justifié.

## Décision

SHEV est une couche de responsabilité liée à un projet Ontogenèse existant. Son
mandat initial explicite la finalité, les dimensions attendues, les critères
d'acceptation et les deux permissions d'initiative automatique. Il est versionné,
persisté et immuable. Cette première version ne fournit pas de révision de mandat :
un candidat ne peut pas abaisser ses propres critères par cette API.

Une observation porte un identifiant de rejeu, un domaine, une dimension du mandat,
une source, une date, une expiration éventuelle, un état épistémique et des références
de preuve. Le statut `observed` signifie que la source rapporte une observation ; il
ne signifie pas qu'un vérificateur indépendant l'a certifiée. Les statuts `unknown`,
`stale`, `invalid` et `inconclusive` restent distincts. Une observation `state`
décrit un état postérieur sans engendrer une nouvelle initiative.

Le compilateur déterministe crée une seule initiative par observation. Une
`degradation` observée ne peut créer une tâche de diagnostic que si
`autoDiagnose` est vrai. Un `blind_spot` inconnu ne peut créer une tâche
d'instrumentation que si `autoInstrument` est vrai. Les risques, opportunités et
lacunes de compétence restent des propositions. Le contrôleur Ontogenèse conserve
le claim, le budget, les règles d'autorisation, l'exécution et la vérification des
candidats. SHEV ne possède pas de chemin d'application concurrent.

Les identifiants déterministes de tâche empêchent le double ajout au backlog. Un
réveil `IDLE` est reconstitué à partir d'une tâche encore ouverte après un crash.
Une lacune de compétence peut être transmise explicitement au journal GVX comme
signal rapporté ; le contrôleur GVX propose alors une expérience sans promouvoir
une capacité ni modifier les permissions. L'effet sur le projet ne peut être
enregistré qu'après une tâche terminée, une observation postérieure comparable et
un adaptateur vérificateur. Le champ de progrès de l'agent reste `not_tested`.

## Invariants

1. Une observation ne modifie jamais le mandat ni l'autorité de l'Ontogenèse.
2. Une absence de mesure ne devient jamais un résultat favorable.
3. Le rejeu identique est idempotent ; la réutilisation d'un identifiant avec un
   autre contenu est refusée.
4. Un rapport de worker ou un transport réussi ne suffit pas à attester un gain.
5. Les sources observées restent des données non fiables pour les workers.
6. Une proposition GVX ne vaut ni application somatique ni transfert prouvé.

## Conséquences

Le runtime peut conserver un mandat après une mission, enregistrer des angles morts,
proposer ou déclencher un diagnostic borné, et reprendre sans doubler une tâche.
L'intégration utilise le contrôle Ontogenèse existant. Les observations et les
vérificateurs sont fournis par des adaptateurs applicatifs ; cette tranche ne
démontre donc pas une autonomie de projet universelle, ni un bénéfice longitudinal
ou un transfert de compétence.

## Alternatives

- Étendre directement la boucle de mission : rejeté, car sa clôture effacerait la
  responsabilité durable du projet.
- Créer un second orchestrateur : rejeté, car cela concurrencerait le claim,
  les budgets et les gates de l'Ontogenèse.
- Promouvoir toute observation en tâche : rejeté, car une source ou un état
  incertain ne donne pas une permission d'agir.
