# Barrière Hémato-Encéphalique (BBB) — Isolation Cognitive

> **Concept** : Une frontière stricte sépare la circulation sanguine du cerveau pour éviter que des toxines ne détruisent le système nerveux central.
> **Statut** : implémenté (genos-core::biomimicry::blood_brain_barrier)

## Bénéfice
Les agents GenOS scrapent le web en permanence. Le risque d'ingérer une instruction malveillante (*Prompt Injection*) et de la placer dans la fenêtre de contexte ("le cerveau") est énorme. L'outil iomimicry_cellular_bbb agit comme une barrière étanche : il force les retours web non structurés à passer par une étape de sanitisation radicale (extraction de texte pure, sans commandes) avant d'être lus par le LLM.
