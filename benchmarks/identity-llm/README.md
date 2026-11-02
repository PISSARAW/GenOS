# Campagne longitudinale avec un LLM local réel

Ce harness conserve la référence de la campagne locale du 2 novembre 2026 :
300 transformations, 970 inférences principales et trois fenêtres de transfert.
Le protocole, les sources GenOS figées et le modèle GGUF sont déclarés dans
`protocol.json`. Les fichiers d'exécution restent sur D: et ne sont pas versionnés.

La référence a **échoué** aux critères de filiation et d'apprentissage :
identifiant et mandat 300/300, parenté 144/300, descendants entièrement corrects
0/10, transfert 22/96 contre 0/96 pour chaque contrôle. Le vérificateur a confirmé
le journal et les métriques. Ce résultat ne qualifie pas tous les modèles GenOS.

Depuis ce répertoire : `node test.cjs` vérifie le harness sans simuler une preuve
LLM. `node run.cjs D:/GenOS-runs/identity-llm/NOUVEAU-DOSSIER` lance une campagne
réelle, sans reprise ni écrasement d'un dossier existant. `node verify.cjs DOSSIER
EMPREINTE-MANIFESTE` rejoue les contrôles hors ligne. Conserver l'empreinte affichée
avant les premières observations. Les réponses brutes restent celles notées.

Il s'agit d'un cas fonctionnel à mémoire externe et poids fixes. Les cycles sont
dépendants, les fenêtres ne sont pas des lignées indépendantes et les bornes
d'identité servent de référence au protocole. Aucune promotion de production
n'est autorisée par ce benchmark.
