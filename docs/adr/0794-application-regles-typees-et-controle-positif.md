# ADR 0794 — Application de règles typées et contrôle positif préalable

- **Date** : 2026-11-04.
- **Statut** : accepté pour le banc expérimental isolé.
- **Domaine** : apprentissage, validation et exécution de programmes bornés.
- **Portée** : adaptateurs du benchmark ; aucun contrat de production modifié.

## Contexte

La [comparaison précédente](../06-qualite-preuves/competence-cinq-variantes-2026-11-04.md)
rencontrait un effet de plancher : les trois variantes sans exécution d'outil
réussissaient zéro question numérique, même si les observations suffisaient.
Les sondes avec règle explicite échouaient dans ce cadre tandis que le calcul
direct réussissait. Une nouvelle comparaison doit donc valider l'application
des règles connues avant de mesurer leur induction.

## Décision

Les quatre variantes LLM utilisent une même interface : le modèle propose des
programmes typés, avec opérateur, époque, famille et coefficients entiers. Un
schéma JSON contraint les champs ; le contrat local vérifie encore le contenu.
Un interpréteur commun applique les programmes admis à l'expression publique.
Il accepte les classes affines, quadratiques et à charnière, sans `eval` ni
code généré arbitraire, avec profondeur et valeurs numériques bornées.

Les coefficients des programmes LLM viennent de réponses natives conservées.
Le validateur ne les synthétise pas. Il vérifie toutes les observations de
l'opérateur à l'époque courante. Une absence d'observation et moins de trois
entrées distinctes imposent des refus explicites. Le contrôle de cohérence
sur des exemples ne démontre pas l'identifiabilité dans toute la classe :
l'oracle séparé continue de mesurer cette incertitude.

Un programme rejeté peut recevoir une unique correction LLM. Les témoins
contiennent seulement une observation d'entraînement, sa valeur et la prédiction
du programme rejeté. Aucun score ni réponse réservée ne revient au modèle.
Toutes les variantes LLM partagent le même plafond de deux propositions par
question ; leurs coûts effectifs sont comptés au niveau des requêtes natives.

Un contrôle positif indépendant de seize cas fournis doit réussir intégralement
avant la génération des mondes de campagne. Les règles fournies sont filtrées
par contexte puis rendues comme objets typés : le modèle doit les retranscrire
correctement et le pipeline doit les appliquer. Ce contrôle valide l'application
avec l'interpréteur, sans prouver l'induction ou le calcul natif du LLM.

Le lancement de la campagne relit et rejoue ce contrôle. Il refuse un résultat
négatif, un modèle différent, une empreinte incorrecte ou une modification des
sources. Les `providedRules` restent vides dans toutes les requêtes primaires,
ce que le vérificateur d'archive contrôle. Les empreintes textuelles normalisent
les fins de ligne afin de ne pas confondre CRLF et modification de sémantique.

Les six mondes, cent observations, cinq étapes et deux contrastes primaires
restent ceux du banc précédent, avec des seeds nouvelles. La synthèse affine
seule conserve son rôle de contrôle ; l'hybride distingue ses réponses d'outil
de celles exécutant des programmes proposés par le modèle.

## Alternatives

- Réinjecter les coefficients de l'oracle : exclu ; ils ne sont pas disponibles aux méthodes.
- Calculer les règles générales dans le validateur : exclu pour garder l'induction comme variable mesurée.
- Présenter une réponse d'interpréteur comme un calcul natif du LLM : exclu ; les sources sont séparées.
- Relancer une même série de validation après adaptation : exclu ; les échecs sont conservés et une nouvelle série est nécessaire.
- Modifier la campagne après ses résultats : exclu ; les sources et seuils sont scellés avant observation.

## Conséquences

L'interpréteur devient une capacité commune aux variantes LLM. Les scores
historiques ne peuvent donc pas isoler causalement cette seule correction :
présentation, contrat, validateur et politique de correction changent ensemble.
Les comparaisons appariées internes de la nouvelle campagne restent interprétables.
Les refus structurels ne sont pas de l'introspection apprise. Un contrôle positif
réussi n'autorise ni promotion runtime ni affirmation de compétence générale.

Le [banc](../../benchmarks/competence-five-arms-v2/README.md) et le
[rapport](../06-qualite-preuves/competence-cinq-variantes-controle-positif-2026-11-04.md)
conservent les commandes, les essais de développement et les preuves réelles.
