# ADR 0294 — Contrats de preuve des chemins runtime NCE

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Natural Creative Ecology, Play, phénotype, culture, POET
- **Lié à** : ADR 0234, `docs/01-concepts/natural-creative-ecology.md`

## Contexte

La mission principale perdait les champs d'entrée du phénotype et du transfert
culturel. Une sortie de commande Play pouvait être comptée comme affordance après
un échec. Le moteur NCE de coévolution renvoyait des descriptions générées sans
exécuter POET. Les erreurs de moteur étaient converties en `null`, et des tableaux
vides augmentaient le compteur d'améliorations. Le vecteur phénotypique utilisait
des buckets de rôle et de stratégie susceptibles de collision.

## Décision

- Les missions et les topologies transmettent les champs NCE nécessaires; les
  signaux de topologie désactivent aussi les moteurs concernés. Chaque erreur de
  moteur est renvoyée dans `nce.errors` et n'est pas comptée comme amélioration.
- Le vecteur `genos.phenotype.v2` conserve sept valeurs numériques et les libellés
  normalisés du rôle et de la stratégie. La sauvegarde conserve le vecteur dans
  `state_json`, lie l'état à son agent et refuse une révision obsolète.
- Le transfert culturel vérifie l'identité et la provenance de l'artefact, modifie
  l'état phénotypique du destinataire et le persiste. Sans benchmark indépendant,
  le transfert reste `measured: false` avec un delta nul.
- Play ne déduit une observation que d'une commande réussie dans un snapshot.
  L'observation est persistée avec agent et snapshot; `verified: false` interdit
  d'en faire une preuve de capacité. La sélection de commandes est déterministe
  pour une graine donnée.
- Le moteur NCE exécute POET seulement avec un split training/held-out et des
  agents fournis. Chaque environnement exige une commande de vérification et des
  chemins protégés. L'espace isolé est supprimé après collecte des preuves.

## Conséquences

Les tests peuvent tracer une mission depuis l'entrée NCE jusqu'au snapshot, au
changement d'état et au score de vérification. Une entrée incomplète échoue avec
une erreur explicite. La suppression des espaces POET peut échouer sous Windows;
ce cas invalide le succès et renvoie `cleanupError`.

Ces contrats ne démontrent pas un apprentissage autonome général. Le benchmark
culturel local exerce une tâche fixe et un témoin non ciblé. Les ablations
synthétiques restent des prototypes; une campagne empirique multi-graines avec
agents et environnements indépendants reste nécessaire avant une conclusion
scientifique.

## Alternatives

- Garder les buckets catégoriels : écarté à cause des collisions.
- Compter les sorties Play comme capacités vérifiées : écarté faute de preuve
  indépendante de l'usage de l'outil.
- Générer des environnements POET sans exécuter les agents : conservé uniquement
  comme générateur distinct, exclu du résultat NCE mesuré.
