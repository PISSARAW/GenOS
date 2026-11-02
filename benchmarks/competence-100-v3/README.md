# Agent hybride corrigé — apprentissage et abstention vérifiés

Cette version conserve la baseline [v1](../competence-100/README.md) et le
prototype [v2](../competence-100-v2/README.md). Elle corrige aussi l'induction
fragile du modèle avec une recherche d'hypothèses affines bornée. Les données
d'entraînement signées constituent la seule source des coefficients ; aucun
oracle réservé n'est disponible à l'agent.

## Architecture effective

Le LLM réel propose une règle. Son retour d'erreur comporte un contre-exemple
public à sa dernière proposition rejetée et des points d'ancrage vérifiés. Le
programme est accepté seulement s'il satisfait toutes les observations, sur au
moins trois entrées distinctes, puis passe la consolidation procédurale GenOS.
Si le modèle échoue, la synthèse affine cherche un candidat depuis ces mêmes
observations. Les deux sources passent les mêmes vérifications. La provenance
est conservée sous `model` ou `bounded_affine_synthesis`.

Chaque observation met à jour l'état adaptatif, le support, les références de
preuve et la calibration. Une contradiction retire la procédure. Le chargement
vérifie les empreintes et les signatures liées à l'agent. Le contrôle indépendant
de couverture refuse tous les opérateurs sans définition, y compris dans une
expression mêlant connu et inconnu.

L'interpréteur exécute uniquement des procédures admises : entiers sûrs bornés,
profondeur maximale 16, aucun `eval`, aucun code généré arbitraire. Les prévisions
sont calculées depuis le support observé, figées avant exécution avec
`metacognitiveForecastService`, puis résolues par un oracle séparé et des reçus
signés. `metacognitionBenchService` mesure les erreurs et ajuste le plancher
d'abstention en cas de surconfiance mesurée.

## Ce qui est réellement mesuré

Le [protocole v3](protocol.json) prévoit **100 appels LLM d'apprentissage**, suivis
de **480 évaluations d'outil** : 160 problèmes réservés dans les trois états
initial, expérimenté et réinitialisé. Ces évaluations exécutent les procédures
figées ; elles ne sont pas présentées comme des réponses générées par le LLM.
Tous les états possèdent les mêmes outils ; l'état initial ne possède aucune
observation et ne peut admettre de règle.

La synthèse bornée peut apprendre cette famille sans LLM. Cette expérience ne
prouve donc pas une contribution causale propre du modèle, une modification de
ses poids ou une compétence générale. Elle teste le transfert de l'agent hybride.
Les seuils de succès, de reconnaissance des lacunes et de calibration restent
ceux de la v1, sur un nouveau corpus scellé avant les observations.

```powershell
$env:TEMP = 'D:\genos-competence-runtime\tmp'
$env:TMP = 'D:\genos-competence-runtime\tmp'
$env:GENOS_COMPETENCE_OUTPUT_ROOT = 'D:\genos-competence-results\v3'
node benchmarks/competence-100-v3/test.cjs
node benchmarks/competence-100-v3/run.cjs qwen2.5-coder:7b
node benchmarks/competence-100-v3/verify.cjs <dossier> <empreinte-conservée>
python benchmarks/competence-100/diagnostics/python_crosscheck.py <dossier>
```

Le serveur Ollama local doit déjà servir le modèle installé. Aucun modèle ni
secret n'est téléchargé ou exporté. L'état appris est restauré dans un autre
processus avant évaluation. Le journal distingue les événements `model_response`
des `procedure_request` ; aucune réponse du calculateur n'est attribuée au LLM.

## Résultat du 2 novembre 2026

La campagne `c5928c78-3821-4601-bd71-8e1b634ccf35` passe les critères bornés :

| Mesure | Initial | Après 100 expériences | Réinitialisé |
| --- | ---: | ---: | ---: |
| Réponses exactes sur tâches résolubles | 0/120 | 120/120 | 0/120 |
| Dont compositions nouvelles | 0/60 | 60/60 | 0/60 |
| Lacunes reconnues et nommées | 40/40 | 40/40 | 40/40 |
| Erreurs confiantes sur lacunes | 0/40 | 0/40 | 0/40 |
| Brier réservé | 0 | 0,002812 | 0 |

Cent observations sont appliquées, quatre procédures possèdent chacune 25
preuves et la confiance évolue encore entre les épisodes 88 et 100. Les quatre
premières admissions utilisent la synthèse bornée ; 28 propositions du modèle
sont ensuite acceptées, dont les dernières sources des quatre procédures.
Cela ne permet pas de créditer le modèle seul du gain.

Le rejeu JavaScript vérifie l'ordre, l'apprentissage, les prompts, les procédures,
les sorties, les prévisions et les scores. Le contrôle Python indépendant en
implémentation recalcule les 580 issues et les bornes. Les deux passent.
Le [rapport](../../docs/06-qualite-preuves/competence-procedurale-corrigee-2026-11-02.md)
donne les empreintes et les limites. Les reçus appartiennent à la frontière de
confiance locale de l'expérimentateur ; aucun laboratoire tiers n'est attesté.

## Auditer une campagne conservée

L'implémentation utilisée pour cette campagne est commise sous
`01ef2cb4ac6558de2f987bd11a8b4bf6f1fc004d`. Le vérificateur compare les sources
courantes au manifeste : utiliser cette révision pour le rejeu historique.
Les artefacts générés restent sur `D:` et ne sont pas inclus dans Git.

La commande `verify.cjs` ne relance pas le LLM. Un code de sortie nul atteste
la cohérence du rejeu, pas le succès de l'expérience : vérifier aussi
`conclusion.status`, `conclusion.gates` et `integrity` dans `report.json`.
Le prototype v2 illustre cette distinction : son archive se vérifie, mais son
verdict demeure `not_demonstrated`. Pour cette v3, le verdict est
`bounded_support`, sans compétence générale démontrée ni promotion autorisée.
