# ADR 0789 — Remplacement gouverné pendant une mission A-Team

- **Date** : 2026-11-04
- **Statut** : Accepté pour le remplacement créatif en attente
- **Domaine** : A-Team, morphogenèse native, scheduler, budgets et preuves
- **Décideurs** : équipe GenOS
- **Lié à** : [qualification Le Dernier Sas](../06-qualite-preuves/morphogenese-live-dernier-sas-2026-11-04.md)
- Portée : remplacement d'un membre encore en attente, à une frontière d'étapes native.

## Contexte

Le dispatch A-Team conserve un plan initial et son scheduler ne relit pas les
membres. La variante adaptative enregistre des propositions sans les appliquer.
Les réparations externes refusent une lease de runner active. La présence d'un
plan de morphogenèse ne prouve donc aucune restructuration pendant la mission.

## Décision

Une politique explicite, figée à la formation, autorise un remplacement borné.
Le déclencheur est une réparation réellement observée dans une session GQEL
authentifiée d'un producteur terminé. Un candidat dormant est préparé mais
n'appartient pas à l'équipe active et ne démarre aucune inférence à la formation.
Le travail et son allocation passent du membre en attente à ce candidat.

Seul le runner propriétaire peut agir, lorsque les processus concernés sont
quiescents. Le membre remplacé et le candidat ne doivent avoir aucune exécution
antérieure ni réservation active. Le type de worker, les droits, le contrat GQEL,
les schémas et le budget du travail ne sont pas élargis. Le gain attendu est une
hypothèse du contrôleur, pas une amélioration artistique démontrée.

La transition utilise le moteur de production existant : snapshot durable,
autorité Ed25519 vérifiée par Rust, gouvernance et hystérésis, protocole MORPH
avec décision durable de COMMIT, puis commit AgentGit. Le remplacement du roster,
des rôles et de la propriété du WorkGraph se fait dans la même transaction
SQLite que le commit natif. Les preuves terminées restent intactes ; les handoffs
visant l'ancien consommateur sont invalidés et reconstruits pour le nouveau.
Le scheduler réconcilie ensuite sa file avec l'équipe persistée et lance le
nouveau worker par les adaptateurs natifs existants.

Les prompts et contrats volumineux restent dans l'état persistant. Le plan
autorisé porte leurs empreintes et reconstruit la projection pour revérifier
l'égalité avant application ; il respecte ainsi la limite de 64 Kio de Rust.
Un savepoint isole toute la persistance du commit, même lorsque la transaction
externe conserve une erreur comme reçu de refus au lieu de la propager.

L'état collectif de ce parcours est lié à la mission, sous une clé dédiée.
Il ne remplace pas l'état collectif global d'autres missions. Une projection
A-Team est vérifiée avant application et après commit, y compris en récupération.
Une décision MORPH déjà commise ne peut pas être présentée comme annulée : une
récupération finalise cette décision sans réexécuter l'effet. Un échec persistant
reste explicite et interdit le lancement de la branche concernée.

La clôture collective revérifie la transition persistée et le roster courant.
La réussite du nouveau worker exige toujours ses preuves natives, les handoffs
acceptés et le reçu final GQEL. Aucun changement de roster n'autorise à lui seul
la promotion de la mission.

## Conséquences

Ce profil ne préempte pas une inférence active et ne déplace pas une enveloppe
de worker déjà scellée. Il réalise un remplacement effectif entre étapes, avec
conservation de l'allocation. Les autres formes de recrutement, l'arrêt d'un
worker actif et une réorganisation arbitraire ne sont pas revendiqués.
Sans configuration de l'autorité Rust, le parcours refuse l'activation.
La récupération respecte la validité de l'autorité native : après expiration,
elle refuse et nécessite une intervention opérateur. Le reçu historique reste
distinct d'une autorisation fraîche d'appliquer ou de reprendre une transition.

Les tests doivent couvrir l'application réelle, les refus d'autorité et de
preuve, le conflit de source, la conservation du budget et des preuves, le
rollback transactionnel et le rejeu sans second lancement. La qualification
« Le Dernier Sas » doit utiliser les fournisseurs réels et conserver son
avant/après, la décision Rust/MORPH, les identités et les exécutions du remplaçant.

Ces cas sont exécutés dans `test_ateam_live_morphogenesis.cjs`. La qualification
réelle `ateam_fdabf90e65bf17c6de7857246ea6ccbc` est terminée : autorité Rust
`APPLY`, MORPH `finalized`, nouveau worker exécuté, clôture collective et
publication GQEL vérifiées. Le dossier lié conserve les identités et limites.

## Activation

Le payload CLI d'une mission A-Team créative avec GQEL peut déclarer :

```json
{
  "morphogenesis": true,
  "adaptiveMorphogenesis": {
    "version": 1,
    "afterMember": "literary_creation",
    "targetMember": "dramaturgy",
    "replacement": {
      "role": "literary_author",
      "missionAppend": "Reprendre la tâche finale et traiter les défauts observés."
    }
  }
}
```

Les sélecteurs sont liés aux identifiants stables lors de la formation.
L'autorité Ed25519 et sa clé publique épinglée doivent être configurées pour
ce processus. `requireTransition: true` impose une transition vérifiée à la
clôture ; la qualification l'utilise pour interdire un faux résultat positif.
Sans cette option, une mission réussie sans défaut déclencheur peut se terminer
sans remplacement. Aucun défaut ni changement d'équipe n'est fabriqué.

## Alternatives

L'[ADR 0790](0790-morphogenese-automatique-guidee-par-observations.md) étend ce
parcours avec une politique V2 de sélection automatique sur quatre familles.
Les règles V1 et leur qualification historique restent distinctes.

Modifier une liste en mémoire ne suffirait pas à changer la mission exécutée.
Autoriser une réparation externe malgré une lease active créerait deux runners.
Changer un worker déjà démarré invaliderait son autorité scellée. Présenter un
candidat préparé comme un membre déjà exécuté fabriquerait une preuve.
