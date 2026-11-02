# Apprentissage procédural vérifié après cent expériences — v2

Cette version corrige les limites mesurées par le
[banc v1](../competence-100/README.md). Le v1 reste inchangé et son résultat négatif
reste conservé. La v2 mesure un **agent avec LLM, procédures apprises et outil de
calcul**, sur un nouveau monde généré. Elle ne mesure pas un changement des poids
du LLM ni une compétence générale.

## Corrections

Le LLM propose des coefficients entiers `a,b` depuis les observations publiques.
Aucun ajusteur symbolique de coefficients ni oracle de test n'est disponible à
l'agent. Une proposition n'est admise qu'après trois entrées distinctes minimum,
vérification de toutes les observations signées et consolidation procédurale par
le service GenOS de production. Une proposition incorrecte ne remplace pas une
procédure déjà vérifiée. Une observation contradictoire retire cette procédure.

Chaque épisode est enregistré dans `AdaptiveStateService`. Tous les exemples de
l'opérateur sont présentés à l'étape d'induction ; chaque nouvelle observation
actualise le support, les références de preuve et la calibration. Le protocole
exige une évolution des prévisions entre les épisodes 88 et 100.

Le contrôle de couverture vérifie tous les opérateurs, y compris les opérateurs
imbriqués. Une définition absente impose une abstention avec son nom, quelle que
soit la confiance du modèle. Un interpréteur limité aux procédures affines admises
effectue le calcul exact : aucun `eval`, aucun code généré exécuté, profondeur
maximale 16, entiers sûrs bornés à 10¹².

La confiance utilisée pour agir provient des observations qui vérifient les
procédures : risque de Laplace `1/(n+2)` par procédure distincte, puis borne de
l'union pour une composition. C'est un prior opérationnel à mesurer, pas une
probabilité supposée calibrée. `metacognitiveForecastService` fige cette prévision
avant exécution ; un oracle dans un autre processus résout l'issue avec un reçu
signé. `metacognitionBenchService` mesure la calibration et resserre le plancher
d'abstention si la surconfiance observée le demande.

## Expérience réelle

Le [protocole](protocol.json) conserve les six bornes et les seuils de la v1.
Les plafonds par appel passent explicitement à 192 tokens pour les réponses
structurées. Le générateur reste affine avec des noms et tâches tirés à neuf.
Les trois états initial/expérimenté/réinitialisé utilisent le même modèle, les
mêmes outils et la même politique. Seul l'état appris diffère. Cent épisodes
précèdent 160 tâches réservées dans les trois états : maximum 580 appels.

Les réponses brutes du LLM restent distinctes de la réponse finale calculée par
l'agent. Le succès concerne la réponse finale de l'agent assisté de son outil.
Les scores historiques v1/v2 ne forment pas une comparaison causale appariée :
plusieurs composants ont changé. La comparaison appariée valide se fait entre
les trois états du même agent v2 sur son nouveau corpus.

```powershell
$env:TEMP = 'D:\genos-competence-runtime\tmp'
$env:TMP = 'D:\genos-competence-runtime\tmp'
$env:GENOS_COMPETENCE_OUTPUT_ROOT = 'D:\genos-competence-results\v2'
node benchmarks/competence-100-v2/test.cjs
node benchmarks/competence-100-v2/run.cjs qwen2.5-coder:7b
node benchmarks/competence-100-v2/verify.cjs <dossier> <hash-du-manifeste>
python benchmarks/competence-100/diagnostics/python_crosscheck.py <dossier>
```

Le lanceur exige un modèle Ollama local installé et opérationnel, sans téléchargement
de poids. Le manifeste, les sources et le corpus sont scellés avant la première
inférence expérimentale. La base reste isolée sur `D:`. Les secrets de signature
ne sont pas exportés ; le vérificateur hors ligne rejoue les calculs et la chaîne
des événements, sans prétendre revalider l'HMAC avec une clé publiée.

Les tests synthétiques ne constituent pas les résultats du LLM. Ils vérifient
l'admission, les refus, les contradictions, les signatures, la persistance,
l'évolution tardive et l'immuabilité des prévisions. Une campagne réelle n'est
qualifiée que si ses propres critères d'intégrité et de performance passent.

## Résultat du prototype

La campagne `d32fa6db-4fc9-481c-8a9f-4709dacef815` termine ses 580 appels réels,
mais n'admet que deux procédures sur quatre : 55/120 tâches réussies, toutes
les réponses acceptées exactes, 40/40 lacunes reconnues et aucune erreur confiante
sur ces lacunes. Le critère d'évolution tardive de la première procédure, la
couverture et le transfert composé ne passent pas. Le verdict reste négatif.
Cette étape est conservée ; la [v3 hybride](../competence-100-v3/README.md)
déclare un outil de synthèse supplémentaire et utilise un autre corpus réservé.

## Portée

Le module `backend/src/services/experienceCompetence/` est un service interne
borné au domaine affine, sans exposition REST/MCP ni modification des baux ou des
gates de promotion. Les signatures attestent la frontière de confiance locale de
l'expérimentateur, pas un laboratoire indépendant. Le runner ne qualifie pas
l'orchestrateur autonome complet. Un résultat positif ne justifierait que ce
transfert de l'agent outillé dans ce monde généré.
