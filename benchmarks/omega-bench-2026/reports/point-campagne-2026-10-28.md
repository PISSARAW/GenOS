# Point de campagne OMEGA-BENCH — 2026-10-28

Ce rapport consigne des résultats de développement sur le corpus public v0.4.0. Ils ne constituent ni une analyse confirmatoire préenregistrée, ni une validation indépendante, ni une mesure sur le holdout scellé.

## Recalcul de D sur E10 et E11

L'audit de l'adaptateur D a révélé que ses appels E10/E11 contournaient le runtime G-CIR Ω. Le chemin a été corrigé : les deux expériences passent maintenant par validation d'enveloppe, compilation du graphe `READ → SELECT → CALL`, puis exécution du service GenOS associé. E10 appelle la transition morphogénétique versionnée; E11 appelle l'allocateur physiologique.

Le recalcul apparié a couvert les 150 scénarios E10/E11, trois répétitions chacun (450 résultats). Les 300 résultats E10 et les 150 résultats E11 correspondent exactement à l'oracle, sans statut invalide ni échec critique. Ces lignes remplacent les anciennes mesures D sur ces portées; les 10 200 lignes complètes de D ont été conservées. Le manifeste de D conserve le manifeste initial et les empreintes des résultats initiaux et du rafraîchissement dans `provenance`.

Le run complet a d'abord terminé par une exception native Windows `0xC0000005` sans écrire de résultat. Un pilote E10 puis le rerun complet ont réussi. La cause du premier arrêt n'est pas déterminée; aucun correctif de cause racine n'est donc revendiqué.

## Ablations mesurées

| Ablation | Portée et contrôle | Résultat descriptif |
| --- | --- | --- |
| A7 — encodage compact | E02, 200 scénarios × 3; round-trip MessagePack G-CIR comparé à la même enveloppe JSON | 600/600 sorties conformes; gain médian d'octets 29,29 % (moyenne 29,83 %). Le seuil proposé de 30 % n'est pas atteint par la médiane. |
| A8 — JSON avec services GenOS | E10/E11, mêmes services que D mais sans runtime G-CIR | 450/450 sorties conformes. Sorties identiques à D pour les 450 paires. Latence médiane: E10 215 ms JSON contre 317 ms D; E11 0,009 ms contre 2,20 ms. Mesures exploratoires sur hôte partagé, sans conclusion de supériorité. |

Les manifestes et résultats générés sont ignorés par Git. Les adaptateurs et la commande de fusion avec contrôle de couverture sont les artefacts reproductibles versionnables. Les latences incluent des frontières d'exécution différentes et ne doivent pas être interprétées comme une comparaison produit.

## État restant

- Les ablations A1–A6 ne sont pas encore exécutées avec des contrôles isolant chacun des mécanismes annoncés. Les baselines externes ne remplacent pas ces contrôles.
- Les essais de charge jusqu'à 10 000 agents ne sont pas exécutés.
- E11 « missions réussies par euro » reste non mesuré : l'hôte Shadow partagé ne fournit actuellement aucune télémétrie énergétique attribuable. Le temps CPU et le TDP ne sont pas convertis en euros.
- Le protocole n'est pas gelé et l'analyse de puissance ne couvre pas encore toutes les baselines et ablations. Le holdout demeure scellé.

La campagne reste donc bloquée pour toute affirmation confirmatoire ou de gain comparatif, même si ces exécutions publiques ont passé leurs vérifications d'oracle.
