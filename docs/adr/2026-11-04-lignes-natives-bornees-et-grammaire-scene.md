# Lignes natives bornées et grammaire de scène

- Statut : implémenté, contrôles synthétiques et probe hors inférence.
- Date : 2026-11-04.

## Contexte

La relance persistante du Dernier Sas a refusé trois réponses de S1 tronquées à
1 536 tokens, pour une cible indicative de 172 mots. Les préfixes observés
dépassent déjà les 4 128 caractères autorisés par le schéma. Les réparations
mesurées fonctionnent, mais la borne de chaîne ne force pas la fermeture JSON.

Le `llama-server.exe` installé annonce le commit `39febd2ad`. Son
[convertisseur de schéma](https://github.com/ggml-org/llama.cpp/blob/39febd2ad/common/json-schema-to-grammar.cpp#L923)
traduit la borne en répétition de caractères ; son
[parseur de grammaire](https://github.com/ggml-org/llama.cpp/blob/39febd2ad/src/llama-grammar.cpp#L622)
transforme silencieusement un maximum supérieur à 2 000 en maximum infini.
Une longue chaîne libre reste donc non bornée pendant l'échantillonnage.

Le probe local `probe-safe-grammar-bounds.py` appelle les fonctions de grammaire
exportées par la DLL installée, avec le vocabulaire nul prévu pour les tests.
Il ne charge aucun modèle et n'effectue aucune inférence. La règle
`[a]{20,4128}` accepte encore 5 000 caractères ; `[a]{20,2000}` refuse le
2 001e. La DLL mesurée a le SHA-256
`d2210968905d084dce4023caf87ef9805837ce0f64cdfde706bb6882fac70886`.
Le script, sa sortie JSON et son journal sont conservés sous
`D:/GenOS-runs/dernier-sas-line-bounds-fix-20261104/`.

## Décision

L'appel natif de scène demande désormais `{ "lines": [...] }`. Chaque élément
est une ligne de corps rédigée par le modèle. Le nombre de lignes est borné à
64 au maximum et chaque chaîne à 2 000 caractères au maximum. Ces bornes
restent représentables par le parseur installé. Les limites concrètes dépendent
du volume indicatif et du plafond de sortie déjà autorisé ; pour les 172 mots
observés, elles donnent 28 lignes de 73 caractères, sous les 1 536 tokens
existants. Les constantes de qualité et le contrat scellé ne changent pas.

Le contrôleur conserve l'en-tête du plan déjà rédigé par le modèle et joint les
lignes par des sauts de ligne fixes. Il n'ajoute aucun acte, dialogue, résultat
ou conclusion. Les lignes restent intactes, y compris leurs espaces et
caractères Unicode. Les sauts de ligne internes, en-têtes supplémentaires,
champs supplémentaires et dépassements sont refusés localement. Le validateur
historique d'une seule scène et la garde de répétition s'appliquent au rendu.
Les drivers de test ou historiques fournissant une scène complète en texte ou
en `sceneText` restent acceptés par le lecteur local ; le schéma natif exige
exclusivement les nouvelles lignes.

Le prompt et ses réparations demandent ce format et ses limites. Les handoffs
et le contexte natif restent transmis intégralement. Une réponse tronquée ou
sans usage vérifié reste refusée ; aucune fermeture JSON ni extraction de
fragment n'est inventée. Les plafonds globaux et le nombre de réparations
mesurées restent identiques.

Les sections du livrable possèdent des bornes inférieures à 2 000, mais leur
ancien motif `+` court-circuitait ces bornes dans la branche `pattern` du même
convertisseur. Le motif porte maintenant explicitement `{1,limite}`. Les
contrôles locaux de paragraphes et les critères sémantiques restent applicables.

## Conséquences et vérification

Les tests de génération vérifient les limites transmises, le rendu exact, les
caractères Unicode, les injections et les drivers historiques. Ils vérifient
également les réparations comptées une seule fois et le refus terminal de
fragments tronqués. Le test natif de scénario utilise le nouveau schéma de
bout en bout, sous les mêmes contrôles d'autorité et de matérialisation exacte.
Les tests des sections vérifient leurs motifs finis et les bornes Unicode.

Le bornage rend la fermeture possible avant l'épuisement courant ; il ne
prouve pas que tout texte arbitraire tiendra dans ses tokens, ni que le modèle
évitera toute répétition. Les contrôles de 1 200 mots, de durée, de qualité et
de promotion continuent de refuser un livrable insuffisant. Une nouvelle
mission réelle doit établir son résultat indépendamment de ces fixtures.

## Alternatives

- Augmenter les tokens laisserait la longue chaîne non bornée.
- Réparer ou accepter un préfixe tronqué fabriquerait une complétude absente.
- Un motif générique peut court-circuiter les limites, mal traiter les
  échappements JSON ou créer une ambiguïté combinatoire entre blocs optionnels.
- Produire des actes dans le contrôleur remplacerait l'auteur par un gabarit.
