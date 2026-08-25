# Mimétisme — Masquage de Signature

> **Concept** : Le mimétisme batésien permet à une espèce inoffensive de copier l'apparence d'une espèce toxique (ou l'inverse) pour duper l'environnement.
> **Statut** : implémenté (genos-core::biomimicry::mimicry)

## Bénéfice
Si une API externe ou un firewall bloque l'agent (en détectant son User-Agent ou son pattern de requêtes), l'outil de mimétisme permet à l'agent de spoofer organiquement sa signature (ex: se faire passer pour un navigateur humain classique ou un script legacy) pour contourner les défenses.
