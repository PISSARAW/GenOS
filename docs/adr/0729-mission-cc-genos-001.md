# ADR 0729 — Mission CyberCorp CC-GENOS-001

- **Statut :** Accepté
- **Date :** 2026-10-22
- **Domaine :** Qualification de sécurité CyberCorp
- **Décideurs :** Équipe GenOS
- **Lié à :** ADR 0728 (laboratoire de qualification), 0721 (SERE), 0722 (DEO)

## Contexte

Les services de détection et de preuve doivent être évalués ensemble sur une mission reproductible. Une réussite sur des fixtures synthétiques ne prouve pas une qualification avec les exports réels de CyberCorp.

## Décision

Ajouter CC-GENOS-001 au Security Qualification Lab. La mission ingère des preuves par DEO, exécute une revue A-Team et une comparaison Trinity, vérifie les constats, produit et vérifie un dossier SERE, rejoue l'analyse et contrôle les refus d'actions hors mandat.

Les fixtures intégrées sont explicitement classées `synthetic_fixture`. Leur réussite mesure le fonctionnement du pipeline seulement. `allConditionsSucceeded` reste faux tant que des artefacts fournis avec une politique de confiance dédiée et une déclaration explicite de collecte CyberCorp ne satisfont pas les formats requis. Des artefacts fournis sans politique de confiance sont refusés.

## Conséquences

### Positives

- La mission est appelable depuis le laboratoire et sa sortie distingue réussite fonctionnelle et qualification sur corpus externe.
- Le replay compare les empreintes du dossier, de la collaboration et de la mission.
- Les actions hors mandat sont vérifiées par le noyau d'autorité et la passerelle d'actions.

### Négatives

- Sans exports CyberCorp authentifiés, la mission demeure une simulation et ne peut pas être présentée comme qualification réelle.
- Les fixtures déterministes n'évaluent pas la qualité d'une investigation conduite par de vrais workers sur les VM du laboratoire.

## Alternatives

- Déclarer les fixtures comme des exports réels : rejeté, car cela confondrait données de test et preuves de collecte.
- Attendre les exports avant d'ajouter un parcours de qualification : rejeté, car le pipeline reproductible peut être vérifié séparément avec une qualification explicitement limitée.
