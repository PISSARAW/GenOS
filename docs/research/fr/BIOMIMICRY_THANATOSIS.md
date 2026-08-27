> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Thanatose et Comportement Deimatic : Feintes Défensives

> Domaine : éthologie (défenses comportementales) — Statut : proposition de recherche

## 1. Fondement biologique
L'opossum fait le mort (thanatose) ; le papillon ocellé déploie brutalement des yeux géants (comportement deimatic). Ces feintes ne visent pas à vaincre l'agresseur mais à **manipuler sa décision** : le prédateur relâche sa proie inerte, ou hésite face à une menace surdimensionnée. Ce sont des défenses passives/psychologiques complémentaires aux défenses actives (combat, fuite).

## 2. Formalisation GenOS
```
Thanatose(C, adversaire détecté) :
  C passe en état « inertiel » apparent : réponses gelées, télémétrie simulée cohérente, écritures suspendues
  Objectif : faire perdre l'intérêt/piste à un attaquant en reconnaissance (bot scraping, injection en sondage)
  Pendant ce temps : journalisation silencieuse complète + interférons discrets vers voisins
Deimatisme : réponse exagérée simulée (fausse surface d'attaque gonflée, honeypots mis en avant)
Garde-fou éthique/opérationnel : durée maximale, jamais utilisé contre utilisateurs légitimes (whitelist)
```

## 3. Mapping primitives existantes
- Autotomie/honeypots (`cyber_immune.rs::AutotomyModule`) — famille défensive dont la thanatose est le maillon passif.
- Cryptobiose — l'état inertiel réel existe ; la thanatose en est la version *simulée*.
- Virophages (`virophage.rs`) — contre-attaque active complémentaire.

## 4. Cas d'usage
- Sondage suspect depuis une IP inconnue : l'agent répond comme un système vide pendant que la traçabilité s'accumule.
- Gonflement deimatic : présenter 1000 faux endpoints pour noyer un scanner.

## 5. Apports attendus
- Palette défensive complète : passif (thanatose) → trompeur (deimatique) → sacrificiel (autotomie) → actif (virophage).
- Gain de temps forensic précieux (l'attaquant croit avoir fini alors que l'observation continue).
- Aucune escalade offensive directe : dissuasion par manipulation informationnelle.

## 6. Points d'intégration
Extension `cyber_immune.rs` (module `deception.rs`), outil MCP `resilience_thanatosis_toggle`.
