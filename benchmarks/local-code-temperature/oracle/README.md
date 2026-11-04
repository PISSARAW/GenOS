# Comparaison avec oracle natif et graphe de mission

Le bilan mesuré et les références de preuves sont conservés dans
[le rapport de qualification](../../../docs/06-qualite-preuves/comparaison-local-code-oracle-2026-11-04.md).

Le contrôleur de cette variante appelle le worker natif, son oracle indépendant
et le contrôle de rapport du parent. Il ne constitue pas une exécution complète
du contrôleur autonome GenOS : `fullAutonomousController` reste explicitement faux.

Le protocole reprend exactement les deux fichiers ADN, les trois missions, les
douze assertions par mission, les trois graines, l'ordre alterné et les budgets du
premier manifeste. Chaque essai conserve un unique appel au fournisseur, 8 192
tokens observés au total au maximum, 1 536 tokens en sortie et 120 secondes pour
le processus complet, préparation et vérification comprises. Aucun échec n'est
relancé. Le contrôleur réserve 120 secondes avant de démarrer l'essai suivant et
s'arrête dans sa fenêtre globale de 25 minutes. Les essais non démarrés restent
dans le dénominateur prévu, sans qualification.

La préparation, les empreintes complètes du dossier, la calibration et le
préchauffage sont archivés séparément et exclus de cette fenêtre mesurée. Une
calibration positive conserve son propre appel réel au modèle ; elle ne remplace
aucun résultat du corpus. Les échecs de préparation sont également conservés.

Les sources reprennent la version figée du précédent benchmark (`01333f81c`,
complétée par `eb7b89601`) et une archive des correctifs oracle/graphe. Le manifeste
contient les empreintes de toutes les sources extraites, des scripts, des génomes,
du binaire et du modèle. Toutes les sources sont vérifiées avant et après la
campagne ; les fichiers du correctif sont aussi revérifiés avant chaque essai.
Les dépendances installées restent lues depuis le dépôt principal, comme lors du
protocole précédent. Les bases, espaces de travail, traces, capsules et fichiers
temporaires de comparaison sont sur D:.

Le validateur du dépôt a ensuite précisé que `mutable` doit être le booléen `true`,
et refuse désormais une chaîne de caractères. Tous les contrats du manifeste
mesuré utilisent déjà le booléen `true` ; les sources et preuves figées de la
campagne ne sont pas réécrites pour intégrer ce durcissement de validation.

L'affectation du worker contient un contrat `javascript_repair_cases` validé puis
persisté avant son incarnation et le scellement de l'autorité. Les deux processus
natifs recalculent les postconditions à partir de l'artefact réel. Un test local
réussi seul ne permet pas d'accepter le résultat. Le graphe rattache chaque reçu
à sa mission authentifiée et conserve les refus.

Les résultats séparent le score des douze assertions, l'acceptation de l'oracle,
le contrôle du graphe et la qualification dans les budgets. Le coût monétaire
et énergétique demeure inconnu ; les tokens et durées observés sont mesurés.
Les génomes restent DRAFT et aucune promotion n'est demandée.

Les scripts `prepare.cjs`, `campaign.cjs` et `worker-run.cjs` sont exécutés depuis
leur copie figée sur D:. `../oracle-audits/verify.cjs` effectue ensuite un audit
indépendant en lecture seule : MAC d'autorité et d'incarnation, journal oracle,
réexécution des assertions, égalité des paramètres par paire et conservation des
refus. Les deux lignes de nonces d'identité natives ne sont normalisées que pour
la comparaison analytique des prompts ; les requêtes originales restent intactes.
