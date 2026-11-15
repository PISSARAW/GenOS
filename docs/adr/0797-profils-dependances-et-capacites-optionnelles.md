# ADR 0797 — Profils de dépendances et capacités optionnelles

- **Statut** : Accepté
- **Date** : 2026-11-14
- **Domaine** : installation, stockage, navigateur, exploitation
- **Décideurs** : mainteneurs GenOS
- **Lié à** : [référence des profils](../03-reference/profils-dependances.md)

## Contexte

L'installation Node complète fournissait systématiquement DuckDB, LadybugDB,
LanceDB, Playwright, Puppeteer et Lighthouse. Plusieurs sont des extensions d'une
capacité principale qui possède déjà un repli SQLite, ou des outils web utilisés
uniquement à la demande. Le coût natif et la surface d'installation étaient donc
imposés même aux exécutions du seul contrôle principal.

Le profil historique doit continuer à fonctionner. Une absence de moteur ou de
navigateur ne doit jamais être interprétée comme une preuve positive.

## Décision

Les moteurs de projection et les outils web deviennent des dépendances npm
optionnelles. Deux profils sont exposés :

- `full`, compatible avec l'installation historique et choisi explicitement par
  `npm run install:full` ;
- `core`, installé par `npm run install:core`, sans dépendances de développement,
  puis allégé des capacités directes cataloguées.

Le catalogue `shared/dependencyProfiles.json` relie chaque capacité à ses paquets et
à son comportement de repli. Les modules optionnels sont chargés lors de leur usage,
pas lors de la construction des services ni de l'enregistrement MCP. Le registre de
stockage expose une dégradation et la cause d'une dépendance absente.

SQLite reste la source canonique. DuckDB, LadybugDB et LanceDB restent des projections
ou candidats. Les audits web sans leurs paquets retournent `inconclusive` ; Browser
Scout refuse avec `GENOS_OPTIONAL_CAPABILITY_UNAVAILABLE`.

Le profil `core` conserve les dépendances optionnelles transitives des composants du
socle. L'option npm globale `--omit=optional` est exclue, car elle retire notamment
les binaires de plateforme dont `sqlite-vec` et ONNX ont besoin.

## Conséquences

### Positives

- Le runtime principal peut être installé sans les moteurs et navigateurs lourds.
- `npm ci` sans option conserve le comportement complet existant.
- L'import des outils MCP sans navigateur reste possible.
- Les replis et absences sont visibles et testables.

### Négatives

- Deux profils doivent être qualifiés dans la CI.
- Un repli SQLite ne couvre pas toutes les opérations du moteur spécialisé.
- La taille économisée doit être mesurée sur des installations propres ; la somme
  des répertoires directs n'inclut pas exactement les dépendances transitives.
- Les anciens paquets `sqlite` et `sqlite3` restent requis par les tests jusqu'à leur
  migration ; l'ADR 0799 les retire seulement du runtime de production.

## Alternatives

- Créer plusieurs distributions npm indépendantes : écarté pour cette étape, car
  cela dupliquerait les versions et les fichiers de verrouillage.
- Déplacer les paquets uniquement en dépendances de développement : écarté, car les
  audits web et projections sont des capacités runtime réelles.
- Supprimer immédiatement les moteurs spécialisés : écarté, car leurs fonctions et
  leurs suites existantes doivent rester disponibles dans `full`.
