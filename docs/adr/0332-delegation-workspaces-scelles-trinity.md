# ADR 0332 Délégation des workspaces scellés Trinity

- **Date** : 2026-10-06
- **Statut** : Accepté
- **Domaine** : Trinity, identité des workers, isolation et preuve

## Contexte

La qualification sur une base SQLite neuve révèle deux blocages du dispatch
Trinity. Le parent lit des colonnes tenant absentes de `agents` au lieu de les
lire sur `workspaces`. Après cette correction, les workers reçoivent un
workspace privé conforme au scellage, puis l'autorité refuse leur lancement
parce que leur workspace diffère de celui du parent.

## Décision

Le tenant du parent est lu sur son workspace. Un worker Trinity peut démarrer
dans son workspace privé uniquement si le contrôle serveur retrouve son monde,
une expérience `sealed_running`, le parent dans le plan scellé, la même empreinte
de snapshot, le chemin enregistré et un tenant identique à celui du parent.
L'identifiant du workspace doit être celui généré pour ce worker et sa visibilité
doit rester privée. Ce contrôle produit un attribut de délégation utilisé par
une règle Cedar explicite pour `StartMission`.

Le parent est recherché par son identité persistée avec un `LEFT JOIN` sur son
workspace. Le schéma autorise les parents sans workspace : leur tenant nul ne
peut déléguer qu'à un monde également sans tenant. Un parent absent ou un tenant
étranger reste refusé. Le garage réutilise le workspace déjà scellé après avoir
revérifié cette liaison, plutôt que d'en créer une seconde copie.

Les traitements factoriels gardent le rôle de base enregistré dans le catalogue
de capacités. L'approche et la validation restent des facteurs explicites dans
le prompt et l'identité de cellule ; ils ne créent pas des rôles inconnus.

Le prompt Codex reçoit la mission complète, le schéma de sortie du worker et
son chemin de travail. La persistance de conscience précède les gates de
clôture sans les remplacer. Le lanceur utilise les paramètres compatibles avec
le CLI installé en conservant `workspace-write` et la revue automatique des
approbations. La confiance des hooks n'est pas forcée ; leur enforcement n'est
pas qualifié par cette campagne.

Les champs expérimentaux du moteur local sont conservés tels que déclarés.
Ils n'acquièrent aucun reçu de vérification du seul fait de leur copie. La
provenance de routage vient uniquement du résultat observé du fournisseur.
L'écriture des artefacts JSON applique la politique d'édition et le confinement
du chemin après décodage du champ `artifactText`.

L'attribut ne provient jamais de la requête ni des métadonnées du worker. Les
contrôles de parenté, quarantaine, autorité épistémique, autorité de mission et
lease restent obligatoires. La règle `Control` ne reçoit aucune extension.

## Vérification et limites

Le test SQLite `test_trinity_worker_authority.js` vérifie le chemin nominal et
les refus pour tenant, snapshot, chemin, parent et état d'expérience altérés.
Les tests Cedar existants conservent le refus d'un worker étranger sans
délégation. Cette correction autorise le démarrage scellé ; elle ne prouve ni
la qualité du résultat ni une promotion et ne permet aucune communication entre
mondes.

## Conséquences

Le lancement réel peut atteindre les travailleurs et produire des livrables
contrôlables. Les plafonds de ressources, les refus d'autorité, la vérification
des claims et les gates de promotion restent effectifs. Le plafond de 8 000
tokens par worker peut interrompre Codex après une réponse correcte : cet arrêt
ne doit pas être remplacé manuellement par une réussite.

## Alternatives

Partager le workspace du parent aurait supprimé le scellage. Autoriser toute
parenté sans liaison serveur aurait étendu l'autorité à des workspaces arbitraires.
Copier des identités de modèle configurées comme provenance observée aurait
fabriqué une diversité. Ces alternatives sont rejetées.
