# Missions LLM multi-agents et outils natifs Rust

**Statut** : Accepté pour un DAG borné et des outils de sources et d'artefacts privés  
**Date** : 2026-11-03  
**Domaine** : Runtime Rust, agents LLM, outils, effets, contexte et preuves  
**Lié à** : [Profil textuel natif](0780-portage-missions-llm-runtime-rust.md)

## Problème

Le profil textuel natif produit une seule réponse. Il refuse les demandes
d'outils et ne compose pas plusieurs agents LLM. Exécuter une commande extraite
de la prose ou laisser un modèle définir ses permissions contournerait les
frontières d'admission, de contexte, de budgets et de preuve.

## Décision

Installer un profil distinct, explicitement sélectionné par `--agentic-config`
et `--executor rust`. Une configuration admise définit deux à quatre agents
logiques, leurs instructions, dépendances antérieures, outils autorisés,
noms d'artefacts et nombre maximal de tours. Le dernier agent consomme
transitivement les résultats de tous les autres. Les appels HTTP effectifs
ont des identités et des contextes distincts ; les agents peuvent utiliser
le même modèle et le même processus hôte. Le DAG est exécuté dans l'ordre
admis, sans prétendre à une isolation par processus ou à une exécution parallèle.

Les `tool_calls` proviennent des champs structurés du fournisseur. Leur
identité et leurs arguments sont conservés avec la réponse brute et les
compteurs reçus. Un texte contenant du JSON ne devient pas un appel d'outil.
Les résultats d'outils sont corrélés aux appels et réellement inclus dans
le dialogue suivant ; les sorties des prédécesseurs sont des données adressées,
jamais des permissions nouvelles.

Le dialogue visible projette les textes et artefacts des dépendances, tandis
que le contexte appliqué garde leurs paquets de provenance complets. Le
plafond temporel d'un tour est borné au temps ordinaire et au bail restants
lors de sa création, puis persisté avec son échéance sans rallonge au rejeu.

Les premiers outils installés sont `read_source`, `list_sources`,
`write_artifact` et `read_artifact`. Les lectures de sources concernent le
snapshot des documents explicitement sélectionnés à l'admission. Les artefacts
sont immuables et privés à la mission dans le CAS ; le modèle ne choisit ni
shell, ni endpoint réseau, ni chemin à écraser dans le workspace. Un accès à
un artefact d'un autre agent exige une dépendance admise.

## Frontières obligatoires

- CONTINUITY vérifie le binding courant, conserve les intentions et reprend
  les observations connues ; une issue HTTP inconnue ne permet pas de redispatch.
- MORPH installe les identités et méthodes des agents réellement appelés.
- SYNAPSE applique puis relit chaque contexte ; sa reconstruction dépend des
  sources admises, observations attestées et reçus d'outils effectifs.
- ALLOSTASIE partage les quotas de tokens, appels modèles, outils et temps
  sur la mission entière, avec réserve protégée et exposition des inconnus.
- OMEGA inscrit l'intention et l'exposition avant l'appel ; les effets CAS
  d'outils et leurs reçus sont transactionnels, sans double exécution au rejeu.
- EVIDENCE refait les deux vérifications structurelles installées et vérifie
  les dépendances et la clôture des opérations avant toute complétion.
- GQWF Exchange rehashe les objets échangés et publie la tête, le reçu et le
  statut final dans une même transaction.

L'assurance finale porte sur le contrat d'artefact textuel explicite.
`semantic_truth_verified`, `promotable` et `external_effects_authorized`
restent faux. Le fait que deux agents ou deux méthodes donnent leur accord
ne constitue pas une preuve de vérité générale. Une obligation sémantique
sans méthode adéquate reste ouverte.

## Points de livraison

1. Contrat multi-agents, graphe admis, sources et permissions explicites.
2. Transport Rust des vrais appels d'outils et dialogue corrélé.
3. MORPH et CONTINUITY : identités installées et journal durable des étapes.
4. SYNAPSE : construction, application et relecture des contextes réels.
5. ALLOSTASIE : budget global et exposition des coûts connus ou inconnus.
6. OMEGA : dispatch modèle unique et outils natifs transactionnels.
7. EVIDENCE : clôture du graphe, contrats et refus des faux succès.
8. GQWF Exchange : artefacts entre agents et publication CAS atomique.
9. Exécuteur et CLI Rust multi-agents avec outils, sans pont Node.
10. Qualification négative, reprises, régressions et essai de modèle réel.

Chaque point reçoit son commit. Les commits suivent les dépendances ; les
nouveaux modules sont activés ensemble lorsque le parcours est câblé.

## Limites

Le fournisseur et le stockage restent de confiance opérateur local. Le
profil n'est pas un service multi-tenant authentifié. Les mesures d'usage
proviennent du fournisseur ; une exposition d'entrée déclarée ne remplace
pas un tokenizer. Aucun plafond de facturation distant ni checkpoint de
poids ou de KV cache n'est revendiqué. Les parcours `integer_sum` et LLM
textuel existants gardent leur contrat et leur sélection propres.

## Alternatives écartées

- Interpréter la prose du modèle comme une commande ou une autorisation.
- Dupliquer le transport historique en perdant les métriques et identités.
- Utiliser un consensus LLM comme preuve sémantique indépendante.
- Autoriser d'emblée un shell libre ou des écritures arbitraires de workspace.
