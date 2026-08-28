# La Spécificité Enzymatique dans GenOS

Ce document explore l'implémentation de la **Spécificité Enzymatique** au cœur du biomimétisme de GenOS (située dans `crates/genos-core/src/biomimicry/enzymes.rs`). Il s'agit du principe directeur garantissant que le système ne devienne pas un chaos incontrôlable.

## 1. Le Modèle de la Clé et de la Serrure (L'Analogie Fondamentale)
* **L'Enzyme (`Enzyme`)** : Un acteur logiciel de transformation, qui accélère ("catalyse") une réaction spécifique.
* **Le Substrat (`Substrate`)** : L'objet de données sur lequel la transformation doit opérer. Il possède une "forme" (sa `shape_signature`).
* **Le Site Actif (`ActiveSite`)** : La condition d'acceptation de l'enzyme (sa `required_signature`).

Dans GenOS, avant toute exécution, l'enzyme vérifie le "binding" (`binds_with`). Si la signature du substrat ne correspond pas parfaitement à la serrure du site actif, la réaction est rejetée. C'est ce qui empêche, par exemple, un outil conçu pour manipuler des AST (Abstract Syntax Trees) d'essayer de "digérer" un log d'erreur brut.

## 2. Le Contrôle du Flux : La Voie Métabolique (`MetabolicPathway`)
Tout comme dans le corps humain, les actions isolées sont rares. GenOS assemble des `Enzymes` dans des chaînes de montage appelées **Voies Métaboliques**.

* L'Enzyme A prend un substrat $X$ et le transforme en produit $Y$.
* La signature du produit $Y$ est la clé parfaite pour le site actif de l'Enzyme B.
* L'Enzyme B prend le produit $Y$ et le convertit en $Z$.

Ceci assure que les étapes d'un pipeline logiciel complexe (comme le traitement d'une tâche de bout en bout) se fassent séquentiellement, avec l'assurance absolue que chaque étape travaille sur le bon type de données, sans effets secondaires chaotiques ("auto-digestion").

## 3. Le Lien avec le reste de GenOS
L'écosystème de GenOS utilise les enzymes comme les "Mains" du système biologique :

1. **Relation avec les PRRs (L'Immunité) :**
   Les PRRs ("Les Yeux") détectent une menace (PAMP/DAMP) et donnent l'alerte. Les enzymes spécifiques à la réponse immunitaire sont alors invoquées (ex: l'enzyme "Purge de Contexte") pour nettoyer les dégâts.
2. **Relation avec les Voies Synaptiques (Le Réseau) :**
   Dans le graphe de la mémoire STDP, l'enzyme agit comme le "Traducteur" et recycleur de neurotransmetteurs. Les traces synaptiques obsolètes peuvent être ciblées par des enzymes d'élagage (*pruning enzymes*) qui ne s'attachent qu'aux connexions dont la trace physique (récepteurs) est faible.

La **spécificité enzymatique** est le secret qui permet à l'agent IA de réaliser des tâches vastes et chaotiques (manipulation de code, génération de texte, déploiement) avec une fiabilité déterministe.
