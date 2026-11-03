# ADR 0767 — Profils d'activation et comparaisons bornées

Date : 2026-11-03. Statut : accepté.

## Décision

Publier les profils `observe`, `bounded` et `resident`. L'inspection est en
lecture seule : configuration, dépendances, activation, autorité et qualification
restent distinctes. Le CLI imprime un diagnostic et termine avec le code 2
lorsque ses dépendances ne sont pas fournies. Il n'installe ni fournisseur,
ni scheduler, ni autorité. Les contrôles d'autorité restent aux frontières des
actions réelles. GNS exige une base durable ; ETT réutilise le contrôle du
scheduler résident, qui exige notamment autorisation, sandbox, récupération,
worker, vérification et comptage d'usage.

La consolidation autobiographique est appelée avant le rappel, sur au plus
50 épisodes de l'agent et du projet courants. Les observations non évaluées ne
deviennent pas des leçons. Une option `consolidate: false` permet une ablation
du raccord ; les autorisations et seuils de consolidation restent inchangés.

Le catalogue Rust rejoint les vingt organisations Node avec `cross_functional_pod`
et les variantes `PeerMesh`. Un test compare les quatre champs de toutes les
organisations. Les qualifications de transitions conservent leurs leases signées,
leurs refus de révocation et leurs compensations existantes.

Le protocole de comparaison exécute témoin, composition complète et retrait de
chaque composant sur les mêmes graines et plafonds de jetons/appels. Il alterne
l'ordre, conserve les empreintes et requiert un vérificateur séparé. Les usages
invalides ou hors budget excluent la paire du calcul. Une erreur d'exécution
reste explicite. Les exécutants doivent isoler leur état et imposer leurs budgets
pendant les appels : le protocole vérifie l'admission après exécution, sans
prétendre préempter une fonction JavaScript arbitraire.

## Portée des preuves

La sonde mémoire vérifie observation, consolidation, rappel et changement d'une
décision ultérieure sur une politique bornée. Ce résultat ne démontre pas une
amélioration métier générale. Les tests d'ablation utilisent un exécutant
synthétique. Toute campagne réelle doit fournir ses exécutants isolés, reçus de
coût et vérification indépendante avant une conclusion empirique.
