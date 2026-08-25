# Biomimétisme & Protéostase : Marquage Ciblé pour Destruction (Ubiquitine)

> Domaine : biologie cellulaire (système ubiquitine-protéasome) — Statut : proposition de recherche

## 1. Fondement biologique
La dégradation des protéines n'est pas un garbage collector flou : chaque protéine à détruire est **marquée** par une chaîne d'ubiquitine (code poly-ubiquitine aux significations distinctes : dégradation, réparation, trafic), puis découpée par le protéasome avec recyclage des acides aminés. Le marquage est décisionnel et auditable ; la destruction est mécanique.

## 2. Formalisation GenOS
```
Ubiquitination(composant k, code u) :
  u ∈ {DEGRADE: nettoyage standard, REPARER: passer aux chaperonnes, ARCHIVER: sporer avant destruction,
       QUARANTAINE: geler et investiguer}
  Chaîne = pile de marqueurs posés par des autorités différentes (self-check interne, détecteur immunitaire, humain)
  Protéasome = le Cleaner existant : ne traite QUE les composants marqués DEGRADE (chaîne complète)
Recyclage : les artefacts valides contenus dans k sont extraits avant destruction (analogie acides aminés)
```

## 3. Mapping primitives existantes
- `resilience/cleaner.rs` — devient le « protéasome » : destructeur mécanique de composants pré-marqués.
- Cryptobiose — implémentation du marqueur ARCHIVER.
- Chaperonnes (doc sœur) — destination du marqueur REPARER.
- Event sourcing — chaque marqueur est signé et attribué.

## 4. Cas d'usage
- Un module obsolète mais contenant des artefacts valides : marqué ARCHIVER+DEGRADE → sporation puis destruction propre.
- Divergence d'avis (détecteur veut détruire, humain veut enquêter) : chaînes contradictoires explicites au lieu d'une course.

## 5. Apports attendus
- Séparation stricte décision (marquage, auditable) / exécution (destruction, mécanique).
- Sémantique riche du nettoyage (aujourd'hui binaire garder/détruire).
- Zéro destruction non motivée : tout composant détruit a sa chaîne de justification rejouable.

## 6. Points d'intégration
Extension `cleaner.rs` (protocole de marquage), schéma `UbiquitinCode` dans `genos-core/src/resilience/`.
