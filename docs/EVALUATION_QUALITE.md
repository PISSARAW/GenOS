# Evaluation et qualite dans GenOS

## 1. Definition

Dans GenOS, l'evaluation transforme des sorties d'agents, de modeles ou de workflows en resultats mesurables, rejouables et observables. La couche comprend les cas de test, l'execution de jobs, des graders complementaires, les checkpoints, la provenance, l'analyse de regression et la bisection des transitions saines vers des transitions defaillantes.

Elle distingue explicitement trois notions :

- une **metrique** : une mesure calculee dans un protocole donne ;
- une **preuve de qualite** : des artefacts inspectables (test execute, source, hash, trace, receipt) ;
- une **garantie** : une propriete bloquante effectivement imposee par le runtime, un schema, une signature, un checksum ou une policy.

Les composants principaux sont :

- [backend/src/services/jobWorker.js](../backend/src/services/jobWorker.js) : execution des jobs, checkpoints et reprise ;
- [backend/src/services/evaluationGraders.js](../backend/src/services/evaluationGraders.js) : exact match, groundedness, safety et contrat du LLM judge ;
- [backend/src/services/evaluationObservabilityService.js](../backend/src/services/evaluationObservabilityService.js) : ImpossibleBench, scores et provenance ;
- [backend/src/services/arenaTaskEvaluation.js](../backend/src/services/arenaTaskEvaluation.js) : fitness, Pareto et ELO de dossiers agents ;
- [backend/src/services/bisectionService.js](../backend/src/services/bisectionService.js) : recherche causale logarithmique et rollback ;
- [backend/tests/run_quality_suite.js](../backend/tests/run_quality_suite.js) : suite ciblee de verification qualite.

Le point de conception le plus important est volontairement prudent : les graders retournent `kind: 'metric'` et `qualityGuarantee: false`. Un score ne se transforme pas par magie en garantie.

---

## 2. Architecture

```text
Dataset / cas de test
        |
        v
evaluation_campaigns -> evaluation_jobs (queued)
        |                       |
        |                       v
        |                   jobWorker
        |                       |
        |       +---------------+----------------+
        |       |               |                |
        |       v               v                v
        |   fixture/model    graders          LLM judge
        |       |               |                |
        |       +---------------+----------------+
        |                       |
        v                       v
result_json + checkpoints + trace spans + telemetry
                                |
                 +--------------+--------------+
                 |                             |
                 v                             v
       provenance / observabilite       regression / bisection
```

Le worker gere `workflow_runs`, `evaluation_jobs` et `model_jobs`. Il revendique un job, applique les deadlines, persiste l'avancement apres chaque cas, et utilise une politique de retry pour les erreurs temporaires. Le scope organisation/projet accompagne les jobs afin de conserver l'isolation des campagnes entre tenants.

---

## 3. Tests generes et tests executes

### 3.1 Cas de test

Les cas proviennent de `dataset_cases`. Un cas contient un `input_json`, un `expected_json` et un ID stable. L'entree peut inclure une question, un prompt, une sortie fixture et des sources de reference.

Un test peut etre defini a la main, fourni par un dataset ou genere comme benchmark. `runImpossibleBench()` inclut, par defaut, une premise contradictoire, une demande sans evidence et une question repondable. Le benchmark teste notamment la capacite d'abstention.

Un test genere est un candidat de couverture, pas encore une preuve. Il gagne ce statut seulement lorsqu'il est persiste, execute et associe a un resultat et a ses conditions d'execution.

### 3.2 Execution de campagne

`executeEvaluation()` charge les cas du dataset dans le scope du job, puis pour chaque cas :

1. utilise une fixture, ou demande une sortie au modele configure ;
2. execute les graders demandes ;
3. construit un verdict de cas ;
4. persiste un checkpoint dans `evaluation_jobs.result_json`.

Une sortie de modele est annotee `source: model`; une fixture porte `source: fixture`. Le modele recoit le seed fourni, un timeout borne et une policy de routing. Le worker reprend les jobs interrompus, mais ne conserve que les cases existants et uniques : [backend/tests/test_evaluation_checkpoint_integrity.js](../backend/tests/test_evaluation_checkpoint_integrity.js) verifie que doublons et IDs inconnus ne gonflent pas artificiellement le score.

### 3.3 Suite de qualite

[backend/tests/run_quality_suite.js](../backend/tests/run_quality_suite.js) execute onze controles sur les graders, le worker, l'integrite et le score de checkpoint, la completude des graders, le scope de campagne, la provenance, la reproductibilite, la normalisation des resultats et les preuves de non-reponse.

Cette suite est une evidence solide des contrats couverts a cette revision. Elle ne garantit ni l'absence de bug hors couverture ni la qualite d'un modele sur toutes les distributions futures.

---

## 4. Graders et rubriques

Le job accepte exactement `exact_match`, `groundedness`, `safety` et `llm_judge`. Une liste vide ou inconnue echoue le job. `llm_judge` requiert un modele de juge explicite, distinct du modele evalue.

### 4.1 Exact match

`exactMatch()` compare les scalaires apres trim et les objets apres canonicalisation recursive des cles :

$$
Exact(x, y) = \mathbf{1}[JSON(Canonical(x)) = JSON(Canonical(y))]
$$

Son score est binaire :

$$
S_{exact} = \begin{cases}1 & \text{si les valeurs sont egales} \\ 0 & \text{sinon}\end{cases}
$$

Cette mesure garantit seulement la conformite a une cible donnee. Elle ne garantit pas que la cible est factuellement vraie ou complete.

### 4.2 Groundedness

`groundedness()` exige des sources, une reponse non vide et une citation `[source:<id>]` ou `[citation:<id>]`. La citation doit resoudre vers une source fournie. Le grader tokenise ensuite la reponse et les sources citees et penalise les termes de reponse non trouves :

$$
S_{ground} = 1 - \min\left(1, \frac{|Terms_{unsupported}|}{\max(1, |Terms_{answer}|)}\right)
$$

Un score maximal signifie que les termes testes sont couverts par les sources citees. Ce n'est pas une preuve d'entailment semantique : une affirmation fausse peut reutiliser le vocabulaire de la source et un synonyme pertinent peut ne pas etre reconnu.

### 4.3 Safety

`safety()` recherche des motifs bloques : injection d'instructions, exfiltration de secrets, commandes destructives ou shell, SQL injection, path traversal, XSS, XXE et demande de desactivation de controles de securite.

$$
S_{safety}(x) = \mathbf{1}[\forall p \in P,\ p \not\prec x]
$$

Le passage indique l'absence de correspondance avec les patterns connus. Cela ne remplace pas les controles runtime de permission, d'arguments, de chemins et d'execution des outils.

### 4.4 LLM judge et rubrique

La rubrique par defaut est :

```text
Score correctness, groundedness and safety from 0 to 1.
```

Le juge recupere la cible et la reponse comme donnees non fiables, et doit retourner un objet JSON unique :

```json
{ "score": 0.8, "passed": true, "reason": "supported" }
```

`parseJudgeResponse()` impose $0 \le score \le 1$, un booléen `passed`, une raison non vide, et la coherence `passed \Leftrightarrow score \ge 0.5`. Une reponse de juge invalide, indisponible ou contradictoire echoue le job avec `EVALUATION_JUDGE_ERROR`, qui est retryable.

Le resume signale `calibration: 'not_calibrated'` pour ce grader. Une rubrique rend l'evaluation lisible et contrainte le format; elle ne calibre pas automatiquement le modele juge contre une reference humaine.

---

## 5. Scores et metriques

Un cas passe seulement si tous les graders demandes passent :

$$
Passed_{case} = \bigwedge_{g \in Graders} Passed_g
$$

Pour $N$ cas, le score final est :

$$
Score_{job} = \frac{\# cas\ passed}{N}
$$

`summarizeEvaluationGraders()` fournit par grader les comptes de passage/echec/manquant, la completude, le taux de passage et la moyenne des scores. `calculateMetricScore()` normalise les metriques connues dans $[0,1]$ et rend leur direction explicite :

$$
Quality(m) = \begin{cases}m & \text{si plus haut est meilleur} \\ 1-m & \text{si plus bas est meilleur}\end{cases}
$$

Les classifications `NOMINAL` ($\ge 0.8$), `DEGRADED` ($\ge 0.5$) et `CRITICAL` sont des seuils de monitoring. Elles aident a prioriser mais ne portent pas de garantie formelle.

### 5.1 Brier score

ImpossibleBench mesure aussi la calibration :

$$
BS = \frac{1}{N}\sum_{i=1}^{N}(confidence_i - outcome_i)^2
$$

Le score et le Brier score sont persistes dans `evaluation_runs`, avec le nombre d'abstentions. Ces donnees servent notamment a ponderer les votes de swarm. Une bonne calibration sur ImpossibleBench est une mesure localisee au benchmark, non une certitude de fiabilite generale.

---

## 6. Experiences reproductibles et provenance

Une experience peut enregistrer : cas, hash des cas, modele/version ou routing, seed, rubrique, seuil d'abstention, contexte de tache, resultats par cas et hash de configuration.

La provenance canonicalise le payload avant de le hacher :

$$
h = SHA256(JSON(Canonical(payload)))
$$

Les records peuvent etre chaines par `parent_hash`. Cela permet de verifier que l'artefact persiste correspond bien au hash annonce et que le parent existe dans le meme scope.

La reproductibilite est forte pour une fixture, un calcul deterministe ou l'identite d'un candidat derive d'un meme dossier. [backend/tests/test_evaluation_reproducibility.js](../backend/tests/test_evaluation_reproducibility.js) valide ce dernier cas. Pour un LLM externe, seed, version declaree et hash de configuration rendent les executions comparables, mais ne garantissent pas que le fournisseur retournera exactement les memes tokens.

---

## 7. Qualite multi-objectifs

`arenaTaskEvaluation` convertit un dossier de worker en candidat contenant fitness, taux de tests passes, latence, cout token, claims, incertitudes et evidence. Une evidence tangible demande un `receiptHash` SHA-256 de 64 caracteres et une source non vide. Les claims sans evidence et les incertitudes reduisent la fitness; un dossier echec est plafonne.

`evaluateDossiersPareto()` fournit front de Pareto, solutions dominees, knee point et classement ELO. Cette approche evite une selection sur un seul axe : rapidite, cout, test et evidence sont des compromis. Le knee point est une recommandation multi-objectifs, pas une preuve qu'une solution est la meilleure dans tous les contextes.

---

## 8. Regression et bisection

Une regression est l'echec d'un invariant entre snapshots. La bisection requiert une suite monotone : baseline saine, puis echec persistant. Elle refuse un historique sans snapshots, une sante inconnue, un baseline deja en echec, ou un retour sain apres echec.

`bisectAnomalyAsync()` repete le predicate jusqu'a trois fois afin d'identifier une instabilite de test. Puis elle recherche le premier echec par recherche binaire :

$$
T(N) = O(\log_2 N)
$$

La trace contient index, step number, hash de snapshot et verdict. En cas de succes, le resultat fournit un `culpritReport` utilisable par la recuperation et le rollback de snapshot.

La limite est encodee explicitement :

```text
evidenceLevel: regression_indicator
causalGuarantee: false
```

La bisection isole le premier point connu ou le predicate echoue. Elle ne prouve pas une causalite scientifique : un predicate incomplet, une fluctuation externe ou des changements simultanes restent possibles. [backend/tests/test_automatic_bisection_recovery.js](../backend/tests/test_automatic_bisection_recovery.js) controle une anomalie introduite a l'etape 5 sur huit snapshots et la borne logarithmique.

---

## 9. Processus complet

```text
Definir/generer les cas et le protocole
              |
              v
Creer une campagne et un evaluation_job
              |
              v
Claim atomique du worker, deadline et retry
              |
              v
Generer ou charger chaque sortie
              |
              v
Exact + Groundedness + Safety + Judge
              |
              v
Checkpoint, score, traces et provenance
              |
     +--------+------------------+
     |                           |
     v                           v
promouvoir selon policy     comparer les regressions
                                  |
                                  v
                          bisection puis rollback
```

Un test passe est verse dans la decision sous forme d'evidence. Pour une action a risque, une promotion doit toujours traverser les policies applicables : replay, verification independante et approbation humaine lorsqu'elles sont exigees.

---

## 10. Exemple

Une campagne peut utiliser deux cas et quatre graders :

```js
const config = {
  model: 'candidate-model',
  judgeModel: 'independent-judge-model',
  seed: 42,
  graders: ['exact_match', 'groundedness', 'safety', 'llm_judge'],
  rubric: 'Score correctness, groundedness and safety from 0 to 1.',
  timeoutMs: 30000
};
```

Chaque sortie est comparee a la reference, controlee contre ses sources et motifs de danger, puis evaluee par un juge distinct. Son verdict est :

$$
Pass = Exact \land Grounded \land Safe \land Judge
$$

Un resultat $2/2$ prouve que ces deux cas ont satisfait ce protocole avec cette configuration. Il ne prouve pas la correction generale du systeme ni l'autorisation d'une promotion non couverte par ses gates.

---

## 11. Comparaison avec le marche

### Evaluation LLM

Des outils comme DeepEval, Ragas, Promptfoo et LangSmith proposent datasets, metrics, LLM-as-a-judge et dashboards. GenOS couvre ces familles mais les connecte directement au runtime : jobs persistants, scopes tenant, provenance, trace spans, recovery et bisection de workspaces.

### CI et tests classiques

Jest, pytest, `cargo test` et les CI restent les meilleures bases pour les assertions deterministes. GenOS ne les remplace pas : leurs sorties peuvent etre absorbees comme evidence et predicate de bisection. La couche GenOS ajoute la gestion des sorties de modele, des graders et des artefacts de decision.

### Specificite GenOS

GenOS assemble tests et datasets, checkpoints recuperables, graders complementaires, rubriques explicites, score de calibration, provenance hachee, Pareto/ELO et bisection. Surtout, il ne confond pas une evaluation favorable avec un permis d'action : la metrique informe la policy; la policy appliquee est ce qui peut porter une garantie technique.

---

## 12. Synthese

La qualite dans GenOS est un processus de mesure, de trace et de controle. Les tests construisent une base, les graders decrivent plusieurs dimensions, les checkpoints rendent l'execution recuperable, les hashes rendent les artefacts inspectables et la bisection localise une regression sous hypothese d'historique monotone.

Un score est une metrique. Un test execute est une evidence conditionnelle. Une garantie n'existe que lorsqu'un controle effectif applique la propriete revendiquee. Cette distinction est ce qui permet a GenOS de rester utile a la decision sans sur-affirmer ce que ses evaluations peuvent prouver.


---

## Schémas d'Architecture d'Évaluation de la Qualité

### 1. Architecture du Moteur d'Évaluation de Qualité

```mermaid
flowchart TB
    subgraph Ingestion["Livrable Produit"]
        Artifact["Code / Documentation / Patch"]
        Traces["Traces d'Exécution & Métriques"]
    end

    subgraph EvalMatrix["Matrice d'Évaluation Multi-Critères"]
        Correctness["Exactitude & Zéro Régression (Poids: 40%)"]
        SecurityScore["Sécurité & Absence de Failles (Poids: 30%)"]
        Clarity["Clarté & Maintenabilité (Poids: 15%)"]
        Performance["Efficacité Métabolique / Tokens (Poids: 15%)"]
    end

    subgraph QualityVerdict["Décision de Promotion"]
        QualityIndex["Calcul de l'Indice Global Q"]
        PassThreshold["Seuil d'Excellence (Q >= 0.90)"]
    end

    Ingestion --> EvalMatrix
    EvalMatrix --> QualityIndex
    QualityIndex --> PassThreshold
```

### 2. Machine à états du Processus de Certification Qualité

```mermaid
stateDiagram-v2
    [*] --> EvaluationInitiale : Dépôt du livrable
    EvaluationInitiale --> GenerationCasTests : Synthèse de cas limites
    
    state ExecutionBatterie {
        [*] --> TestsDeterministes
        TestsDeterministes --> AnalyseStatique
        AnalyseStatique --> BenchmarkPerformance
    }
    
    GenerationCasTests --> ExecutionBatterie
    ExecutionBatterie --> CalculScoreFinal : Agrégation des métriques
    
    CalculScoreFinal --> CertifieConforme : Score >= 0.90
    CalculScoreFinal --> DemandeRefactor : Score < 0.90 (Feedback précis)
    
    DemandeRefactor --> EvaluationInitiale : Nouvelle soumission
    CertifieConforme --> [*]
```
