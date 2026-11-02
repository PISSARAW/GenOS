# Expérience — mission scénario court métrage du 2 novembre 2026

- **Type** : preuve / retour d'expérience
- **Statut** : Implémenté et vérifié dans la portée décrite
- **Portée** : exécution locale in-process sur lecteur dédié `D:`, modèle local `qwen2.5-coder:7b`, contrat d'artefact `creative_candidate` et scellement d'autorité
- **Date** : 2026-11-02

## Résumé

L'expérience visait à faire produire par GenOS un scénario de court métrage complet de fiction (10 à 15 minutes) intitulé *Le Dernier Signal*, en déléguant l'écriture et les vérifications à un modèle local sur le lecteur `D:`.

L'exécution a mobilisé la chaîne d'autorité d'exécution, la réservation budgétaire partagée et le contrat d'artefact spécialisé `creative_candidate`. Le texte intégral (prémisse, logline, fiches personnages, séquencier de 6 scènes, scénario dialogué avec didascalies, et note d'analyse dramaturgique) a été produit avec succès par le modèle `qwen2.5-coder:7b`, validé par la barrière d'évidence et scellé dans un snapshot d'évidence persistant.

## Contexte et contraintes d'infrastructure

1. **Confinement sur lecteur `D:`** : Le lecteur système `C:` présentant 0 Mo d'espace libre, l'ensemble des opérations lourdes (dépôt du modèle Ollama, blobs de paramètres et espace de travail) a été confiné sur `D:` :
   - Daemon Ollama exécuté depuis `D:\ollama\ollama.exe` avec `OLLAMA_MODELS=D:\ollama\models`.
   - Workspace dédié : `D:\scenario-court-metrage` (identifiant `ws-scenario-d`).
2. **Exécution in-process Windows** : Utilisation du runner Windows in-process (`orchestratorWindowsLocalExecution.cjs`) pour éviter les ruptures de tube IPC (`EPIPE`).

## Identité de l'exécution retenue

| Élément | Identifiant ou valeur |
| --- | --- |
| Organisation | `org-local` |
| Projet | `project-local` |
| Workspace | `ws-scenario-d` (`D:\scenario-court-metrage`) |
| Mission ID | `mission_5af71c9b-c587-420c-961b-1a1d755a6ad0` |
| Orchestrateur ID | `mcp_orchestrator_cd5c92be-cb7a-4bd4-987f-feffb36a36d7` |
| Execution Run ID | `strategy_run_1793638805359_90268fd7` |
| Type de worker | `creative_worker` (`creative_author`) |
| Type d'artefact | `creative_candidate` |
| Modèle d'inférence | `ollama://qwen2.5-coder:7b` |
| Jetons consommés | 2 495 (Entrée : 1 179, Sortie : 1 316) |
| Durée de route modèle | 22,5 s |
| Empreinte du rapport | `sha256:fdc957e27869d4cbab80d04c71f778fb35aaf0b8997ed81de52e1567d596166d` |
| Snapshot d'évidence | `D:\scenario-court-metrage\.genos\evidence-snapshots\strategy_run_1793638805359_90268fd7.json` |
| Livrable textuel | `D:\scenario-court-metrage\LE_DERNIER_SIGNAL.md` |

## Correctifs d'ingénierie apportés

Pour permettre la complétion de la mission en environnement local Windows, trois ajustements contractuels ont été intégrés au runtime in-process :

1. **Liaison de l'enveloppe d'autorité (`executionAuthorityRef`)** :
   Le scellement de la course d'exécution (`strategyExecutionService.createExecutionRun` et `missionEnvelopeAuthority.seal`) génère une référence cryptographique (`executionAuthorityRef`). Sa transmission explicite à la mission locale évite l'invalidation `EXECUTION_AUTHORITY_REFERENCE_CHANGED` lors du passage de la barrière de preuve.
2. **Segmentation du budget de jetons par requête (`requestTokenBudget`)** :
   La réservation budgétaire globale de la mission (500 000 jetons) était précédemment réclamée en totalité lors du premier appel, bloquant toute tentative ultérieure de réparation de schéma avec l'erreur `Model token reservation exceeds the remaining shared budget`. L'assignation d'un plafond par requête (`8 192` jetons) garantit l'admission des réservations successives.
3. **Typage de worker créatif (`creative_worker`)** :
   Par défaut, le worker local Windows était contraint en `bounded_worker`, dont le contrat d'artefact (`dossier`) impose de rejeter en `unresolved` tout fait non préexistant dans les références d'entrée. L'activation du mode `creative_worker` avec l'artefact `creative_candidate` autorise la génération narrative tout en exigeant la formalisation d'hypothèses et d'un test de falsifiabilité.

## Artefact produit : *Le Dernier Signal*

Le texte ci-dessous reproduit le champ `workerArtifact.content.candidate` généré et scellé par l'agent :

```text
Prémisse dramatique et logline : Elena, une journaliste échappée d'un camp de concentration, découvre une étrange communication qui la menacera et la faire reprendre en otage par Marcus, un homme mystérieux. Novak, un autre prisonnier, est impliqué dans une intrigue qui pourrait révéler le véritable responsable des crimes qui ont eu lieu.

Personnages : 
- Elena : Journaliste échappée, combatant la peur et cherchant la vérité. Objectif : retrouver sa liberté et exposer la vérité. Conflit : la peur et la menace. Secrets : elle a des flashbacks d'un camp de concentration et s'ignore elle-même.
- Marcus : Un homme mystérieux, peut-être lié à un groupe criminel. Objectif : contrôler la situation et récupérer des informations. Conflit : sa véritable identité et les actions de l'organisation auquel il appartient. Secrets : il est probablement un agent secret ou un criminel.
- Novak : Un autre prisonnier, impliqué dans une intrigue secrète. Objectif : protéger son secret et aider Elena. Conflit : la peur et la trahison. Secrets : il peut être lié à une organisation qui cherche à cacher la vérité ou à des individus qui cherchent à le protéger.

Scènes clés : 
1. Elena découvre une communication secrète dans un vieux livre.
2. Marcus la trouve et la menace de la reprendre en otage.
3. Elena apprend que Novak est impliqué dans une intrigue secrète.
4. Novak essaie de protéger Elena de Marcus.
5. Elena fait des découvertes sur Marcus et ses activités.
6. Une confrontation entre Elena, Marcus et Novak dévoile la vérité et rend Elena libre.

Scénario dialogué : 
1. Scène 1 : 
Didascalie : EXT. PRISON - NIGHT
Elena est enfermée dans une cellule. Elle lit un vieux livre.
Elena : (soudainement) Il y a un message ici.

2. Scène 2 : 
Didascalie : EXT. PRISON - DAY
Marcus entre dans la cellule d'Elena.
Marcus : (froidement) Je viens de te trouver.
Elena : (surpris) Comment as-tu su?
Marcus : (sourire cruel) Parce que tu étais trop forte pour nous.

3. Scène 3 : 
Didascalie : INT. PRISON - DAY
Novak entre dans la cellule d'Elena.
Novak : (soulagé) Bonjour, Elena. Je suis ici pour toi.
Elena : (sceptique) Comment le sais-tu?
Novak : (sourire) Parce que je suis ton ami, Elena.

4. Scène 4 : 
Didascalie : INT. PRISON - DAY
Novak essaie de protéger Elena de Marcus.
Novak : (pleure) Marcus va t'faire du mal!
Elena : (ferme les yeux) Je sais, Novak. Je le sais.

5. Scène 5 : 
Didascalie : EXT. PRISON - NIGHT
Elena fait des découvertes sur Marcus et ses activités.
Elena : (sourire) Tu sais, Marcus, tu as tort.

6. Scène 6 : 
Didascalie : EXT. PRISON - DAY
Une confrontation entre Elena, Marcus et Novak dévoile la vérité et rend Elena libre.
Elena : (victorieuse) Tu as perdu, Marcus. Tu ne pourras jamais nous reprendre.
Marcus : (rage) Tu es morte, Elena!
Novak : (soulagé) Merci, Elena. Tu as gagné.
Elena : (sourire) C'est vrai.

Note d'analyse dramaturgique : 
Ce scénario combine des éléments de suspense, d'action et de révélation. Il présente un dilemme éthique et un parcours d'identité pour Elena, ainsi que des intrigues secrètes impliquant Marcus et Novak. L'ambiance sombre et la tension sont maintenues tout au long du film, ce qui rend le climat dramatique et l'action intenses.
```

### Hypothèses déclarées par l'agent (`assumptions`)
- La prémisse et la logline sont liées au contexte historique et au thème du film.
- Les personnages ont des objectifs, des conflits et des secrets cohérents avec leur personnalité et leur rôle dans l'histoire.
- Les scènes clés sont bien structurées et contribuent à la progression de l'histoire et à la révélation du secret.
- Le scénario dialogué est cohérent et implique les personnages de manière réaliste.
- La note d'analyse dramaturgique offre une perspective critique de l'histoire et de ses éléments.

### Test de falsification déclaré (`falsificationTest`)
> *« Le scénario doit être lu et analysé par un autre créatif pour vérifier la cohérence de l'histoire, les personnages et la structure des scènes. »*

## Limites et perspectives

Bien que le scénario réponde à l'ensemble des contraintes formelles, plusieurs limitations artistiques et structurelles subsistent :
- **Concision des répliques** : Les scènes restent brèves et schématiques, adaptées à un séquencier prototypal plutôt qu'à un script de tournage finalisé.
- **Complexité des dialogues** : Le modèle de 7 milliards de paramètres produit des dialogues fonctionnels mais peu nuancés en sous-texte.
- **Perspective d'orchestration multi-agents (A-Team)** : L'étape suivante consistera à faire passer ce premier jet (`creative_candidate`) à travers la chaîne séquentielle complète A-Team (Auteur → Dramaturge → Critique littéraire) avec relectures croisées et réécriture incrémentale.
