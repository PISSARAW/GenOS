# Campagne comparative externe de morphogenèse

## Contrat commun

Le contrat `genos-morphogenesis-competitive-campaign-v1` compare GenOS,
LangGraph, Magentic, AFlow et DyLAN sur les mêmes couples tâche/graine. Chaque
observation doit lier le même modèle, la même politique d'outils et le même digest
de jeu de données. Elle porte la version et le digest de l'adaptateur, la qualité,
les tokens et la latence, un reçu d'exécution indépendant et un reçu d'oracle dans
un workspace distinct.

Le contrôle refuse une tâche incomplète, une signature invalide, un contrat commun
divergent ou moins de dix tâches communes. Il calcule ensuite les différences de
qualité appariées entre GenOS et chacun des quatre rivaux, sous les mêmes plafonds
de tokens et de latence. Une supériorité n'est qualifiée que si la borne inférieure
corrigée pour quatre comparaisons est strictement positive contre les quatre rivaux.
Même dans ce cas, le claim reste limité à la campagne observée.

```bash
node backend/bin/genos-morphogenesis-competitive-campaign.cjs <recu-campagne.json>
```

Le validateur est implémenté et testé, mais aucun reçu issu des cinq runtimes externes
n'est archivé au 17 octobre 2026. Le résultat courant est donc `not_observed`; GenOS
ne revendique pas de supériorité sur LangGraph, Magentic, AFlow ou DyLAN. Cette
distinction est obligatoire : le test synthétique du contrat prouve la gate, pas le
résultat d'une campagne réelle.

## Preuves exécutables

- `backend/src/services/morphogenesis/competitiveCampaignEvaluator.js` valide les
  observations et calcule les comparaisons appariées.
- `backend/bin/genos-morphogenesis-competitive-campaign.cjs` ingère un reçu externe.
- `backend/tests/test_morphogenesis_competitive_campaign.js` vérifie le rejet du vide,
  la qualification mathématique d'un fixture signé et le rejet après altération.
