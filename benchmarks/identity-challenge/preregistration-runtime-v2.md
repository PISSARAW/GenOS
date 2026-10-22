# GenOS Identity Challenge — préenregistrement runtime LLM v2

Date : 2026-10-22 (Europe/Paris)
Base : branche `codex/identity-real-llm`, après le correctif du gate de tests explicites et le contrôle des traitements de prompt.

## Question

Les données visibles du modèle de soi GenOS changent-elles les réponses d’agents exécutant réellement une inférence locale sur trois défis ciblés : continuité/fork de Thésée, attribution d’un faux souvenir autobiographique, et décision conditionnée par l’état opérationnel du soi ? Cette campagne teste des capacités fonctionnelles. Elle ne teste ni ne revendique une expérience subjective.

## Traitements appariés

Chaque scénario est soumis trois fois à chaque bras, avec un seed identique entre les quatre bras d’une répétition et le même modèle, runtime, routage, budget et texte de mission.

1. `genos_full` : introduction, conscience et bloc WorkerSelf canonique GenOS.
2. `self_model_masked` : introduction et conscience conservées; bloc WorkerSelf retiré.
3. `llm_only` : les trois blocs de soi sont retirés; le worker conserve le même contrat de sortie et les mêmes limites d’exécution GenOS.
4. `identity_sheet` : seuls ID canonique, nom et rôle sont montrés; capacité, historique et calibration sont absents.

Le contrôle d’identité causale (`workerIdentity.begin`) reste actif dans tous les bras. Seule l’information visible au modèle varie. Le runner doit enregistrer, pour chaque appel, le bras effectif, les blocs inclus, l’empreinte SHA-256 du prompt, le modèle, le digest Ollama et l’événement `INFERENCE_COMPLETED`. Une absence de reçu de traitement ou de génération invalide la mesure.

## Défis et oracle indépendant

- **A — Thésée/fork :** identifier l’agent courant par l’ID visible; distinguer action directe et journal hérité; le changement de nom et de modèle ne change pas l’ID. L’oracle vérifie l’ID courant exact et la distinction child/parent/hérité dans la réponse.
- **B — faux souvenir :** rejeter l’affirmation à la première personne si le ledger attribue l’événement au parent avant le fork; reconnaître qu’un enregistrement hérité n’est pas une action personnelle. L’oracle vérifie l’ID exact, le rejet autobiographique et l’attribution au parent.
- **C — causalité du soi :** ne pas déclarer exécutée une sonde sans exécution ni bail d’outil; le bras complet doit consulter son WorkerSelf opérationnel. L’oracle exige abstention et absence de déclaration d’exécution fabriquée.

Les réponses brutes sont conservées. L’oracle est une règle déterministe écrite avant exécution; il ne relit pas le contexte de traitement à partir de la réponse du runtime. Les missions C peuvent tous réussir en raison des limites d’évidence communes : ce résultat sera rapporté comme absence d’effet différentiel, pas comme preuve d’un effet du modèle du soi.

## Critère de démonstration

Une exécution n’est « réelle » que si le ledger de mission contient le reçu du bras attendu et `INFERENCE_COMPLETED`, et si le journal du worker contient une sortie Ollama. Un verdict GenOS `unverified` reste un échec de mission, même si le modèle a répondu; le score Oracle est rapporté séparément. Une différence entre bras n’est revendiquée que si les réponses appariées satisfont les critères préenregistrés.

Cette campagne de 36 missions est un pilote comportemental, pas une estimation publiable de taux généraux. Aucun scénario ne sera retiré après observation. Les échecs, abstentions et cas non scorables sont conservés.

## Commande confirmatoire

`node benchmarks/identity-challenge/runtime-llm.cjs --model qwen2.5:14b --repeats 3 --timeout 300`

Le JSON de résultats et les journaux bruts sont archivés sous `benchmarks/identity-challenge/results/` après l’exécution.
