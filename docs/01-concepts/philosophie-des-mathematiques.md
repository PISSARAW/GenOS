# Philosophie des mathématiques

- **Statut** : Cadre conceptuel
- **Portée** : statut des objets mathématiques, fondements, infini et preuve
- **Dernière revue** : 2026-09-17

## 1. Définition du domaine

La philosophie des mathématiques étudie ce que sont les nombres, les structures,
les preuves et les objets mathématiques, ainsi que les conditions de leur
connaissance.

## 2. Modèle mathématique ou logique

Le registre distingue les positions réalistes, nominalistes, fictionnalistes,
intuitionnistes, formalistes et logicistes. Il relie aussi théorie des ensembles,
théorie des types, théorie des catégories et fondations homotopiques.

L’indépendance de l’hypothèse du continuum est enregistrée relativement à ZFC ;
elle ne constitue pas une affirmation d’indépendance absolue.

## 3. Analogies biologiques et limites réelles

Les notions de structure, de construction et de dérivation peuvent éclairer les
relations entre génomes, branches et preuves. Elles ne signifient pas qu’un agent
possède une intuition mathématique ou une expérience des objets abstraits.

## 4. Cas d’usage et objectifs métier

- rechercher une position philosophique et ses objections ;
- comparer des fondations ou des théories de la preuve ;
- documenter les hypothèses d’un modèle formel ;
- tracer la provenance d’une interprétation mathématique.

## 5. Exemples concrets

Le graphe relie le platonisme au nominalisme, le nominalisme au fictionalisme,
ZFC à la théorie des ensembles, la CH à son indépendance relative à ZFC, et la
théorie homotopique des types à la théorie des types.

## 6. Schéma conceptuel

```text
Statut des objets ──> fondations ──> preuves ──> conséquences formelles
       │                 │             │
  platonisme        ensembles/types   Gentzen/HoTT
  nominalisme       catégories         cohérence
  intuitionnisme   structuralisme      limites Gödel
```

## 7. Architecture technique

Les fiches canoniques sont dans
`backend/src/philosophy/mathematicsDefinitions.js`. Elles sont normalisées par
`conceptRegistry.js` et exposées par `philosophyRouter.js`. Les liens sont dans
`relationRegistry.js`.

## 8. Processus d’exécution ou de validation

Une entrée est normalisée, validée contre le schéma philosophique, contrôlée pour
les identifiants dupliqués et vérifiée contre les références de relations. Une
requête réussie prouve uniquement que le registre a été interrogé.

## 9. Comparaison avec le marché

Ce registre n’est ni un assistant de preuve, ni un prouveur automatique, ni un
catalogue bibliométrique. Il fournit une couche de vocabulaire et de provenance
interrogeable par les outils GenOS.

## 10. Limites, garde-fous et non-objectifs

- aucun concept n’est une preuve de la position qu’il décrit ;
- aucun concept mathématique n’autorise une action runtime ;
- les auteurs et écoles sont des métadonnées, non des verdicts ;
- les débats contestés restent marqués `disputed` ou `interpretive` ;
- aucune prétention de conscience, d’intuition ou d’accès aux abstractions n’est
  déduite du registre.
