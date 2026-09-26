# 0130 — Contrats comportementaux des variants Rhizome

- **Statut** : Accepté
- **Date** : 2026-09-26
- **Domaine** : Rhizome, routage, persistance, sûreté, morphogenèse
- **Décideurs** : Équipe GenOS
- **Lié à** : [ADR 0118](0118-preparer-les-workers-et-operer-le-graphe-rhizome.md), [ADR 0125](0125-profils-morphologiques-composables.md)

## Contexte

Les profils Rhizome exposaient des paramètres sans toujours les relier à des opérations
observables. Les sessions persistantes ne détenaient pas de leases de branches; les
sessions éphémères perdaient toute trace résumée à la fermeture; les profils résilients
ne garantissaient pas de routes indépendantes; et plusieurs exigences de confidentialité,
traduction et propagation procédurale n'étaient pas vérifiées par le runtime.

## Décision

1. Chaque variant doit influencer une opération vérifiable, tout en conservant les
contrats d'admission, de preuve et de promotion existants.
2. Les sessions persistantes conservent graphe, traces, lignées de routes, leases bornés
dans le temps et cicatrices de réparation; la maintenance expire les leases et applique
la décroissance/pruning configurés.
3. Les sessions éphémères ne conservent pas leur graphe après fermeture; elles peuvent
laisser un fossile de synthèse sans conserver les artefacts de mission.
4. Le routage résilient sélectionne des chemins sans arêtes communes et minimise la
réutilisation des domaines de défaillance intermédiaires. Le routage multiobjectif combine
coût, latence, risque, confiance, fraîcheur, trafic et nouveauté selon le profil.
5. La confidentialité est une contrainte de chemin et de domaine de confiance. Une
frontière inter-domaines exige une preuve d'admission liée au contexte de sécurité du nœud.
6. Les ponts inter-représentations peuvent exiger validation aller-retour, équivalence
sémantique et perte d'information sous un seuil, tous liés au reçu signé du vérificateur.
7. La propagation procédurale peut exiger validation causale et essais de compatibilité
locaux avant transmission culturelle.
8. La réparation consigne un diagnostic de route et son résultat; la croissance reste
soumise au budget, à l'utilité attendue, au risque de duplication et à l'admission vérifiée.

## Conséquences

### Positives

- Les profils modifient le choix des routes, les opérations de maintenance et les portes de
  validation, plutôt que de servir uniquement de métadonnées.
- Les reçus, lignées, leases, fossiles et cicatrices rendent les décisions inspectables.
- Le runtime refuse de traiter un profil de confiance comme une preuve de sécurité.

### Négatives

- Les raccourcis Small-World ne sont pas créés automatiquement : une arête nouvelle doit
  rester soumise à une preuve d'admission de capacité. Le profil privilégie les hubs
  observés et pénalise les points d'articulation.
- Les leases et fossiles ajoutent un stockage SQLite à maintenir et migrer prudemment.

## Alternatives

- Traiter les champs de profil comme documentation seulement : rejeté, car un variant doit
  produire des effets observables.
- Créer automatiquement des arêtes raccourcies sans preuve de transport : rejeté, car la
  connectivité structurelle ne prouve pas la compatibilité des capacités.
