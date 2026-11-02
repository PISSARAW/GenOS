# ADR 0771 — Filiation vérifiée et règles apprises validées

**Statut** : Accepté
**Date** : 2026-11-02
**Domaine** : Identité causale, ontogenèse, qualification LLM
**Décideurs** : Mainteneurs GenOS
**Lié à** : [Épistémologie et preuve](../01-concepts/epistemologie-et-evidence.md), [Harness LLM](../../benchmarks/identity-llm/README.md)

## Contexte

Une campagne locale réelle a terminé 300 transformations et 970 inférences avec
un résultat négatif vérifié : identifiant et mandat stables, parenté correcte
144/300, descendants entièrement corrects 0/10, transfert 22/96. Des réponses
inversaient la parenté malgré un chemin correct. Trois opérateurs distincts
avaient la même règle affine fausse en mémoire. La persistance des données ne
qualifie pas la sémantique des connaissances conservées.

## Décision

Le runtime fournit un contexte de reconnaissance calculé depuis les origines de
fork scellées. Il vérifie chaque chaîne et son ancrage de checkpoint, la portée
organisation/projet et la finitude de l'ascendance. Un parent déclaré sans fork
scellé reste inconnu. Les noms et rôles ne servent pas de preuve de filiation.
Les relations sont orientées de l'agent vers la cible. Les branches collatérales
restent distinctes des individus sans ancêtre commun. L'auteur d'un épisode est
relu dans son stockage ; un épisode hérité garde cet auteur et sa propriété
héritée, y compris lorsqu'une note à la première personne le contredit.

La projection des pairs et le prompt d'identité utilisent ces faits vérifiés.
Une filiation indisponible ne détruit pas les observations de pair déjà acquises.
Le contexte est un service interne, pas un nouveau droit MCP ou une permission
héritée. Son empreinte lie les faits aux têtes historiques utilisées ; elle ne
constitue pas une signature externe ni une attestation matérielle.

Le mandat opaque est ancré dans un événement immuable avant activation et hérité
depuis un parent au fork vérifié. Une proposition de mémoire personnelle est
admise seulement si elle correspond à cet ancrage. Un mandat mal recopié par le
LLM reste une erreur notée et ne remplace pas la dernière mémoire correcte.
L'information de naissance reste présentée tant qu'aucune copie correcte n'a été
admise ; les réponses ultérieures utilisent la mémoire personnelle ainsi validée.
Cette porte évite qu'une seule mauvaise copie initiale empoisonne tous les cycles.

L'apprentissage de ce cas utilise deux familles de règles typées : affine entière
et transformation textuelle à préfixe/suffixe fixes avec inversion et casse.
Le LLM propose tous les paramètres. Le validateur n'infère ni ne répare une règle
à sa place : il évalue la proposition contre les exemples d'entraînement fournis
par le caller de confiance, vérifie leur identité, la famille et l'identifiabilité.
Les exemples de test restent absents de cette porte. Deux entrées numériques
distinctes identifient une affine ; les variantes textuelles compatibles doivent
être uniques. Une seule observation ou un texte ambigu ne suffit pas.

Chaque tentative reste auditable. Une proposition fausse n'écrase pas la dernière
règle admise. Un nouveau contre-exemple révoque une règle active. Les reçus sont
recalculés au chargement depuis la règle et ses exemples, au lieu de faire confiance
au seul mot « validé ». La garantie reste conditionnelle à la famille déclarée et
à la vérité des exemples du caller ; ce n'est pas une preuve universelle ni une
autorité de promotion de production.

La nouvelle campagne conserve les seuils, budgets, nombre de cycles, tâches,
contrôles et poids du modèle de la référence. `baseline-criteria.json` les fige
et le chargement du protocole rejette tout écart. Toutes les réponses notées
restent les sorties brutes du LLM, sans correction après oracle ni nouvelle
tentative. Le vérificateur reconstruit les admissions depuis ces sorties et les
feedbacks, puis contrôle indépendamment les règles admises dans le monde caché.
Le pilote de développement est explicitement non confirmatoire.

Les calculs visibles sont structurés pour éviter de consommer leur champ en
paraphrasant les instructions. Un plan d'application contient uniquement les
règles mémorisées et l'ordre des entrées, sans résultat calculé par le runtime.
Le LLM produit les différences, coefficients, produits, inversions, casse et
résultats. Les contrôles utilisent le même plan avec leur propre état de mémoire.

## Conséquences

### Positives

- La reconnaissance s'appuie sur la causalité du runtime et garde son orientation.
- Une connaissance fausse ne devient plus une règle réutilisable par simple écriture.
- Les rejets, révocations et reprises de processus sont contrôlables et durables.
- La référence négative reste versionnée et les résultats restent sur D:.

### Négatives

- La vérification des ancêtres a un coût et une profondeur maximale de 128.
- La validation ne couvre que les deux familles explicites et des exemples fiables.
- Le LLM peut encore mal appliquer une règle correcte sur un problème inédit.
- Le résultat concerne un agent outillé par GenOS, pas un LLM sans ces services.

## Alternatives

Changer les seuils, exclure les erreurs ou corriger une sortie après l'oracle est
rejeté. Augmenter le modèle ou son budget n'est pas la correction testée ici.
Conserver des règles libres non vérifiées reste possible pour d'autres mémoires,
mais ces entrées ne sont pas admises par `validatedRuleMemory`.
