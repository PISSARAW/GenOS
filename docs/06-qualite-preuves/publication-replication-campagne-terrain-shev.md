# Publier et répliquer une campagne terrain SHEV

- **Statut** : procédure de publication ; aucune campagne terrain publiée ici
- **Portée** : rapport sanitisé, archive probante externe et réplication indépendante
- **Dernière revue** : 2026-10-20

Cette procédure transforme un export terminal en dossier auditable. Elle n'autorise
pas à présenter un run local, une répétition accélérée ou un transport réussi comme
une preuve terrain. Un rapport négatif ou invalide doit rester visible.

## 1. Entrées obligatoires

La préparation du rapport exige :

- le manifeste scellé et son `manifestHash` ;
- l'export terminal produit par le
  [runbook terrain](../04-exploitation/executer-campagne-terrain-shev.md) ;
- les reçus des 25 paires ou la liste explicite des fenêtres absentes ;
- les digests du commit, des environnements, outils, dépendances et oracles ;
- le journal des ticks, reprises, interventions et incidents ;
- l'inventaire content-addressed de l'archive brute externe ;
- la décision de revue indépendante et l'identité de ses auteurs.

Une référence inaccessible ou un digest non recoupé est signalé comme preuve
manquante. Il n'est pas remplacé par une description narrative.

## 2. Séparer archive brute et publication Git

L'archive brute externe conserve les octets nécessaires à l'audit : logs complets,
diffs, sorties de tests, reçus, métriques, événements développementaux et journaux
de reprise. Son inventaire contient pour chaque objet :

| Champ | Exigence |
| --- | --- |
| identifiant | chemin logique stable, sans chemin absolu de machine |
| digest | SHA-256 des octets archivés |
| taille | nombre d'octets |
| type | média ou schéma de l'objet |
| portée | campagne, bras, phase et fenêtre |
| rétention | date ou politique de suppression |
| accès | rôle autorisé, jamais un secret d'accès |

L'inventaire possède lui-même un digest racine, recoupé depuis une session en lecture
seule. Le rapport Git publie ce digest racine et les digests utiles, pas l'archive
volumineuse.

Ne jamais ajouter au dépôt :

- une base SQLite ou tout fichier `*.db` ;
- `.env`, token, clé, cookie, capacité ou URL signée ;
- un prompt ou contexte contenant des données confidentielles ;
- les workspaces, caches, dépendances ou artefacts générés ;
- des logs bruts contenant des identités ou chemins locaux ;
- une archive compressée utilisée pour contourner ces règles.

## 3. Sanitiser sans altérer la preuve

La sanitisation produit une vue publique, jamais une nouvelle source de vérité :

1. copier le rapport exporté vers une zone de revue vide ;
2. remplacer les identifiants personnels et chemins machine par des pseudonymes
   stables ;
3. retirer secrets et contenus métier confidentiels ;
4. conserver les valeurs numériques, statuts, timestamps et digests non sensibles ;
5. produire une table des retraits avec leur motif et le digest de l'objet brut ;
6. faire relire le résultat par une personne qui n'a pas produit les runs ;
7. vérifier qu'aucun lien publié ne contourne les contrôles d'accès.

Une redaction ne doit pas transformer un échec en succès, supprimer une fenêtre,
changer un seuil ou arrondir une mesure au point d'en modifier le verdict.

## 4. Gabarit du rapport daté

Créer après la campagne un fichier distinct, par exemple
`resultats-campagne-terrain-shev-AAAA-MM-JJ.md`. Ne jamais créer ce fichier avant de
disposer des résultats. Sa structure minimale est la suivante.

### 4.1 Identité et portée

- date de début et de fin ;
- commit de code et état de propreté ;
- identifiant, version et digest du protocole ;
- `campaignId`, `manifestHash` et mode `field` ;
- dimension mesurée et projet pseudonymisé ;
- statut terminal exact et `promotionEligible: false`.

### 4.2 Conditions verrouillées

Publier les digests modèle, outils, dépendances, permissions, snapshot initial,
oracles et suites de test. Décrire les deux attestations d'intervention et les
frontières d'isolation des workspaces.

### 4.3 Résultats par bras

| Mesure | Contrôle | Traitement | Seuil ou comparaison |
| --- | ---: | ---: | ---: |
| fenêtres d'apprentissage valides | à renseigner | à renseigner | `5` |
| fenêtres réservées valides | à renseigner | à renseigner | `20` |
| taux de réussite réservé | à renseigner | à renseigner | delta `>= 0,10` |
| régressions par fenêtre | à renseigner | à renseigner | hausse `<= 0` |
| interventions humaines | à renseigner | à renseigner | réduction `>= 0` |
| coût moyen | à renseigner | à renseigner | ratio `<= 1,25` |
| tokens moyens | à renseigner | à renseigner | ratio `<= 1,25` |
| durée moyenne | à renseigner | à renseigner | ratio `<= 1,25` |

Ajouter les victoires traitement, victoires contrôle, égalités, valeur p du test des
signes et résultat de chaque contrôle préenregistré. Les dénominateurs et données
manquantes restent visibles.

### 4.4 Développement SHEV

Rapporter les cinq observations de douleur attendues, les pressions avant et après,
les progrès réservés confirmés et les clairances associées. L'absence de clairance
ou une pression non bornée est un échec de contrôle, pas une valeur à imputer.

### 4.5 Incidents et interventions

Lister chronologiquement :

- ticks manqués, tardifs ou concurrents ;
- arrêts et reprises ;
- erreurs d'oracle, d'archive ou de vérification ;
- interventions humaines, auteur, motif et bras ;
- fenêtres invalidées, avec règle appliquée ;
- toute déviation du protocole, même sans effet apparent sur le verdict.

### 4.6 Verdict et limites

Reprendre le statut terminal sans le renommer. Distinguer :

- ce que les données soutiennent pour ce pilote ;
- les contrôles qui ont échoué ou restent inconnus ;
- les facteurs confondants et limites de puissance ;
- ce qui n'est pas démontré sur d'autres dépôts, modèles ou dimensions ;
- les changements envisagés pour un futur protocole, jamais appliqués rétroactivement.

### 4.7 Provenance

Inclure le digest racine de l'archive brute, la date de recoupement, le vérificateur,
la politique de rétention et une matrice reliant chaque agrégat publié aux références
de preuves. Un accès restreint est indiqué explicitement.

## 5. Publier aussi les échecs

Les cas suivants ont chacun un rapport :

- `hypothesis_not_supported` ;
- campagne abandonnée avant ou pendant l'exécution ;
- campagne invalide pour fuite, dérive de verrou ou conflit d'identité ;
- archive incomplète ou digest impossible à recouper ;
- dépassement de budget ou horizon temporel non atteint.

Le rapport explique le dernier état fiable et la cause. Il ne réutilise pas les runs
valides dans une nouvelle campagne sans un protocole qui autorise explicitement
cette réutilisation.

## 6. Revue avant fusion

Avant d'ajouter le rapport sanitisé à Git :

- recalculer le `manifestHash` et le digest racine d'archive ;
- vérifier les 25 identifiants de fenêtres et les deux bras ;
- recalculer les agrégats depuis l'export, indépendamment du texte du rapport ;
- rechercher secrets, chemins absolus, identités et données confidentielles ;
- vérifier les liens relatifs et l'absence de fichiers générés ;
- confirmer que les incidents et résultats négatifs sont présents ;
- faire signer la revue par une identité distincte du producteur.

Le commit du rapport utilise le tag `[DOC]` et ne contient que la documentation et
les petits manifestes explicitement autorisés.

## 7. Réplication indépendante

Une première campagne positive soutient l'hypothèse sur son pilote. Avant une
affirmation générale, exécuter au moins une réplication qui :

- possède un nouveau `campaignId`, une nouvelle graine et de nouveaux workspaces ;
- part d'une révision déclarée et d'un snapshot propre ;
- conserve la même version de protocole, dimension et seuils ;
- utilise cinq nouvelles tâches d'apprentissage et vingt nouvelles tâches réservées ;
- affecte des producteurs, oracles et vérificateurs indépendants de la première
  campagne autant que l'organisation le permet ;
- dispose de sa propre archive brute et de son propre digest racine ;
- dure elle aussi au moins 72 heures ;
- publie son résultat sans filtrage selon le signe de l'effet.

Une réplication qui change le modèle, le projet ou le protocole est utile pour la
validité externe, mais elle n'est pas une réplication exacte. La présenter comme une
extension et publier séparément ses différences.

## 8. Synthèse inter-campagnes

Ne pas additionner directement les fenêtres de plusieurs campagnes. Préenregistrer
la méthode de synthèse, vérifier l'hétérogénéité des projets et conserver les
résultats par campagne. Un verdict positif suivi d'un échec de réplication interdit
une conclusion générale ; il appelle une analyse des différences et éventuellement
un troisième protocole préenregistré.

L'apprentissage des coefficients endocriniens ne commence qu'après plusieurs
campagnes comparables. Il ne réécrit aucun manifeste, seuil ou résultat historique.

## Voir aussi

- [Protocole pilote](protocole-campagne-terrain-shev.md)
- [Matrice de qualification stewardship](matrice-qualification-stewardship-v3-2026-10-20.md)
- [Exécuter la campagne](../04-exploitation/executer-campagne-terrain-shev.md)
- [Épistémologie et preuve](../01-concepts/epistemologie-et-evidence.md)
