# ADR — GQEL V2 : construction hiérarchique et contrôle localisé

**Date :** 2 novembre 2026. **Statut :** implémentation testée localement ;
qualification réelle et intégration globale à exécuter.

## Constat

Sur la base `0460180`, V1 additionnait des points pour des rubriques et mots-clés.
Le générique réussissait sur la présence d'un texte. Des commentaires contenant
`===` comptaient pour les tests. Les critiques, l'inversion d'ordre et le budget
étaient déclarés mais non exécutés dans la boucle. La réparation tronquait le
contexte à 4 000 caractères ; la comparaison se faisait contre la dernière tentative,
pas la meilleure. Une mutation pouvait précéder le plafond de tours. Le pilote
limitait tout le scénario à 1 500 tokens par réponse.

Le rapport du Dernier Sas avait bien refusé la promotion à 75/100 pour un seuil de
80. Le problème est la portée du score et la production, pas une promotion fictive.
Le benchmark à réponses fixes ne démontrait aucun gain d'un LLM.

## Recherches utilisées

- [Re3, EMNLP 2022](https://aclanthology.org/2022.emnlp-main.296/) et
  [DOC, ACL 2023](https://aclanthology.org/2023.acl-long.190/) : plan détaillé,
  génération progressive et cohérence. Application : plan causal relu et scènes
  complètes recevant leur contexte antérieur. Aucun pourcentage publié n'est
  extrapolé à GenOS ou à llama3.1:8b.
- [Self-Refine](https://arxiv.org/abs/2303.17651) : feedback et révision itératifs ;
  cela ne garantit pas une amélioration de chaque tentative.
- [Localisation des erreurs, Findings ACL 2024](https://aclanthology.org/2024.findings-acl.826/) :
  distinguer détection et correction. Application : défauts accompagnés de citations,
  retour à l'étape responsable et nouvelle vérification.
- [CRITIC, ICLR 2024](https://proceedings.iclr.cc/paper_files/paper/2024/hash/fef126561bbf9d4467dbb8d27334b8fe-Abstract-Conference.html) :
  retours d'outils externes ; les tests logiciel doivent être réellement exécutés.
- [LLM-as-a-Judge, NeurIPS 2023](https://papers.neurips.cc/paper_files/paper/2023/hash/91f18a1287b398d378ef22505bf41832-Abstract-Datasets_and_Benchmarks.html) :
  biais des juges, comparaison avec ordre inversé et prudence sur l'indépendance.
- [Help Me Write a Story, ACL 2025](https://aclanthology.org/2025.acl-long.1254/) et
  [LitBench, EACL 2026](https://aclanthology.org/2026.eacl-long.362/) : nécessité de
  mesurer la qualité des récits et des critiques auprès de lecteurs humains.

## Décision

Séparer conformité structurelle, jugement sémantique et preuve de gain. Figer le
contrat, appeler réellement des lecteurs, rejeter les avis non étayés, comparer à
la meilleure version, réparer la première étape responsable et conserver les échecs.
Un chemin positif de production/réparation est testé, pas seulement le rejet.

Les citations prouvent la présence du passage, pas la justesse du jugement. Les
contrôles positif/négatif sont un minimum, pas une certification des critiques.
Les données du modèle ne deviennent jamais commandes ou autorisations.

## Concepts GenOS : réalisé et restant

| Concept | Réalisé dans ce lot | Limite |
|---|---|---|
| Contrats worker | Hook conservé, reçu en mémoire lié à l'artefact et au contrat. | Pas de reçu durable signé ; revalidation après redémarrage. |
| A-Team | Responsabilités plan/rédaction/lecture, réparation ciblée, dépendances aval invalidées, obligation existante conservée. | Pilote à adaptateurs, pas nouveau TeamRun natif ni intégration universelle. |
| AEIS | Rejet des preuves inventées, inconnues et succès sur simple format. | Contrôles GQEL locaux, pas preuve globale d'efficacité AEIS. |
| GQWF / continuité | Versions immuables, empreintes, checkpoints, meilleure version préservée. | Stockage du pilote, pas moteur GQWF natif invoqué. |
| AGOW / homéostasie | Budget partagé et arrêt borné sur stagnation. | Contrôleur local, pas marché AGOW exécuté. |
| Trinity / Biocénose | Candidats comparés, ordre inversé et dépendances explicites des lecteurs. | Aucun déploiement automatique de mondes ou quorum natif. |
| Morphogenèse | Changement effectif de méthode : retour au plan. | Aucun changement de topologie ou recrutement revendiqué. |
| GVX / mémoire | Décisions et preuves conservées, gain non présumé. | Aucun apprentissage ni promotion GVX automatique. |
| GNS / SHEV / NCE | Aucun effet revendiqué dans ce lot. | Adaptateur et preuve requis avant de déclarer un raccord. |

## Compatibilité

La façade conserve ses exports. Les réponses des adaptateurs doivent être mesurées,
les contrats V1 recompilés et les critiques explicitement configurées. Le contrôle
worker n'appelle aucun modèle en cachette. L'ancien benchmark est requalifié sans
effacer ses résultats historiques ; les anciennes références sont archivées.

Écartés : score par mots-clés, minimum universel de dialogues, boucle infinie,
changement de modèle non autorisé, score assimilé à un gain causal, correction
silencieuse des citations et reprise d'un reçu JSON comme autorité.
