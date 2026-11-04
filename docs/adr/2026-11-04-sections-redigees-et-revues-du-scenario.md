# Sections rédigées et revues du scénario

- Statut : implémenté, vérification synthétique du contrat et du workflow.
- Date : 2026-11-04.

## Contexte

Le workflow narratif produit une continuité de scènes. Le brief du Dernier Sas
demande également une logline, des profils et une note dramaturgique. La
matérialisation native conserve exactement le candidat : elle ne peut donc pas
ajouter ces sections. Les inventer dans le code masquerait le travail demandé
au modèle. Les critiques de scénario voient habituellement uniquement le corps
des scènes pour empêcher le paratexte de justifier la qualité dramatique.

## Décision

Une option facultative `screenplaySections: { characterNames: [...] }` entre dans
le contrat avant son scellement. Les noms sont explicites, uniques et bornés ;
ils ne sont pas déduits du brief ni d'un plan possiblement incomplet. L'option
est réservée au profil scénario. Son absence conserve la forme des anciens
contrats et n'ajoute aucun appel. Le preset du Dernier Sas demande Alain et Vera.

Le contrat ajoute le critère dur de brouillon `screenplay_sections_complete`.
La compilation et la vérification des contrats fournis contrôlent l'option.
Un digest recalculé ne permet pas d'omettre, dupliquer ou affaiblir ce critère
canonique. Les obligations artistiques existantes restent applicables.

Après la construction des scènes et avant leur matérialisation exacte,
`write:screenplay_sections` demande au générateur le titre, la logline, les
profils, objectifs et secrets des personnages exacts, puis la note dramaturgique.
Le JSON et ses paragraphes sont bornés, sans saut de ligne. L'appel emploie
l'invocateur et les réparations de protocole existants, avec un plafond de
4 096 tokens limité par le contrat. Usage inconnu et sortie tronquée restent
terminaux. Aucun texte substantiel n'est rempli par le contrôleur.

L'assemblage ajoute des libellés fixes aux champs rédigés et conserve les scènes
caractère pour caractère, dans leur ordre. Les préfixes `Titre :`, `Personnage :`,
`Logline :`, `Profil :`, `Objectif :`, `Secret :` et `Note :` empêchent un contenu
commençant par `INT.` de devenir un faux en-tête de scène. La note finale est
hors du corps compté par les contrôles de volume et de continuité.

Pour chaque lecteur, le nouveau critère seul reçoit le livrable intégral et les
noms du contrat. Les autres critères continuent de citer uniquement les scènes.
Les deux appels sont mesurés séparément, puis leurs verdicts sont regroupés
sous l'identité du même lecteur, avec les digests de leurs portées de citation.
La présence des champs ne remplace pas la revue sémantique de leur substance et
de leur cohérence. Un refus ou un verdict inconnu bloque toujours la promotion.
Le premier artefact natif conserve son chemin existant sans appel ajouté.

## Conséquences et vérification

`backend/tests/test_gqel_screenplay_package.cjs` vérifie dix cas synthétiques :
compatibilité de l'option absente, bornes et noms, contrats altérés puis
rescellés, absence d'appel sur l'artefact initial, schéma strict, réparation
mesurée, arrêts sans usage ou pour troncature, faux en-têtes, ordre avant
matérialisation et revue par portée avec refus du paratexte pour `craft`.
Ces fixtures vérifient le contrôleur, elles ne prouvent aucune qualité
artistique de llama3.1:8b. Une relance réelle doit conserver ses propres preuves.

## Alternatives

- Faire ajouter le paratexte par la matérialisation violerait le candidat fixé.
- Le fabriquer depuis le plan confondrait intentions et texte rédigé.
- Ouvrir toutes les citations au paratexte affaiblirait les critères dramatiques.
- Rendre ces sections obligatoires pour tous les scénarios modifierait les
  contrats historiques sans demande explicite.
