# ADR 0030 — Immunité épistémique et composition de résultats

- **Statut** : Accepté
- **Date** : 2026-09-19
- **Domaine** : Orchestration, preuve, mémoire, promotion
- **Lié à** : [ADR 0022](0022-resultats-operationnels-et-preuve.md), [ADR 0029](0029-resultat-formel-messagepack.md)

## Contexte

Les dossiers de workers, empreintes textuelles, preuves déclarées et merges de
fichiers ne suffisent pas à établir qu'une synthèse est vraie. Ils ne garantissent
ni l'exhaustivité des hypothèses, ni l'équivalence de deux raisonnements, ni la
compatibilité des domaines de validité. L'équivalence mathématique générale et la
vérité générale ne sont pas décidables par le runtime.

## Décision

GenOS ajoute un assemblage d'**immunité épistémique** évalué avant promotion quand
`promotion.require_epistemic_assurance` est activé. À l'image du complexe majeur
d'histocompatibilité, chaque résultat expose une identité canonique, son domaine,
ses hypothèses et la preuve transportée. Une cascade de complément bloque la
promotion dès qu'un contrôle manque :

1. deux acteurs indépendants attestent le même registre complet d'obligations ;
2. chaque obligation requise est liée au digest d'une preuve ;
3. chaque racine promue possède un reçu HMAC de vérificateur indépendant, lié au
   résultat, à la preuve et à un vérificateur pré-engagé dans le contrat ;
4. les équivalences non identiques exigent un témoin, puis les doublons sont coalescés ;
5. toute contradiction dont les domaines se chevauchent ou restent inconnus est
   résolue par témoin ;
6. la composition est un graphe acyclique de résultats formels dont toutes les
   dépendances existent ;
7. la réutilisation d'un échec exige un témoin d'applicabilité portant le domaine et
   les contraintes ;
8. l'influence d'un worker cite des nœuds de résultat acceptés ou rejetés et une
   justification de décision, pas seulement du texte libre.

Le merge de fichiers reste une opération postérieure. Il n'est jamais assimilé à
la composition du graphe de preuve.

## Conséquences

Cette gate transforme les limites sémantiques en obligations vérifiables et rend
les refus auditables. Elle est opt-in pour préserver les contrats historiques ; les
missions à enjeu doivent l'activer. Elle ne crée aucun oracle de vérité : la qualité
finale dépend des vérificateurs de domaine et de l'indépendance réelle des acteurs.

Le coût augmente : deux recensements de contraintes, des reçus de vérification et
des témoins de relations sont nécessaires. En contrepartie, une preuve seulement
bien formée, une similarité vectorielle ou un merge three-way ne suffisent plus à
promouvoir un résultat.
