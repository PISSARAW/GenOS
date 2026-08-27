> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Gap Junctions : Couplage Direct Sélectif

> Domaine : biologie cellulaire (jonctions communicantes, connexines) — Statut : proposition de recherche

## 1. Fondement biologique
Les gap junctions sont des canaux directs entre cytoplasmes voisins : ions et petites molécules passent **sans passer par l'espace extracellulaire**. C'est le couplage électrique des cardiomyocytes (le cœur bat en synchronisation via ces jonctions). Propriétés clés : sélectivité de taille/charge, régulation dynamique (une jonction peut se fermer — découplage — pour isoler une cellule endommagée).

## 2. Formalisation GenOS
```
GapJunction(A ↔ B) :
  Canal persistant bidirectionnel d'états légers {variables partagées, compteurs, flags} — PAS d'events complets ni d'artefacts lourds
  Sélectivité : liste blanche de types de variables par jonction (connexines = types autorisés)
  Découplage : si A détecte B corrompue → fermeture immédiate de la jonction (isolement protecteur, comme le découplage cardiaque)
Usage type : synchronisation fine de capsules intimement liées (paire mutualiste, clone mitotique)
```

Différence avec les canaux existants : stigmergie/gossip = diffusion indirecte ; gap junction = couplage direct intime, faible latence, bande passante limitée mais garantie.

## 3. Mapping primitives existantes
- `organization/network.rs` — famille de canaux où s'ajoute ce mode.
- Capsules mutualistes (`mutualism.rs`) — candidates naturelles au couplage.
- Interférons/détecteurs — source des signaux de découplage.

## 4. Cas d'usage
- Synchronisation d'un duo chercheur/vérifieur : le vérifieur voit l'état de travail en continu sans polluer le journal global d'events.
- Paires de clones mitotiques pendant leur fenêtre de divergence contrôlée.

## 5. Apports attendus
- Étage de communication intermédiaire manquant : ni broadcast coûteux ni isolation totale.
- Isolement rapide des composants défaillants (découplage) sans apoptose prématurée.
- Modèle cardiaque éprouvé pour la synchronisation de flottes serrées.

## 6. Points d'intégration
Extension `organization/network.rs` (type de canal `gap_junction`), politique de découplage automatique.
