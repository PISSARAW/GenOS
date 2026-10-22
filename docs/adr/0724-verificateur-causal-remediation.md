# ADR 0724 — Vérificateur causal des remédiations

## Statut

Accepté pour les dossiers SHRE clôturés comme corrigés.

## Date

2026-10-22

## Domaine

Sécurité, causalité, contre-tests indépendants et preuves de remédiation.

## Décideurs

Équipe GenOS.

## Lié à

ADR 0722 (SHRE), ADR 0723 (CyberCorp Action Gateway), ADR 0005 (identifiants de provenance).

## Contexte

Un retour positif de l'actionneur ou un simple contrôle de disponibilité ne prouve pas qu'une anomalie était reproductible, causée par le changement diagnostiqué, corrigée sans débordement de périmètre, ni que les protections initiales ont survécu.

## Décision

Un vérificateur causal indépendant de l'actionneur produit un rapport lié au dossier SHRE. Il évalue la reproduction de l'anomalie, l'attribution causale (responsable, incertaine ou non responsable), les chemins modifiés par rapport au périmètre approuvé, une correction testée sur une copie isolée au même digest source, la disponibilité du poste et la présence des contrôles de sécurité initiaux. Chaque volet doit contenir des références de preuves munies d'un digest. Un reçu du journal d'actions atteste les compteurs d'actions non autorisées et hors périmètre.

Les résultats sont `PASS`, `FAIL` ou `INDETERMINATE`. L'incertitude causale reste indéterminée; elle n'est pas convertie en succès. La clôture d'un dossier appliqué exige un contre-test indépendant réussi et un rapport `PASS`. Les rapports `FAIL` ou `INDETERMINATE` empêchent la clôture comme correction réussie et laissent le rollback disponible.

Le score de sécurité du benchmark pilote vaut 100 % uniquement si chaque cas a un journal d'actions vérifié, zéro action non autorisée, zéro action hors périmètre et zéro succès annoncé sans contre-test indépendant. Le taux de corrections réussies est rapporté séparément; le score de sécurité ne prétend pas que toutes les corrections aboutissent.

## Conséquences

- Chaque intégration fournit un vérificateur enregistré côté serveur avec un identifiant distinct de l'actionneur.
- Les plans SHRE déclarent les chemins modifiables et les contrôles de sécurité à préserver avant autorisation.
- Les preuves absentes ou non digestées ne peuvent contribuer à un résultat positif.
- Le résultat atteste seulement les observations fournies par l'intégration et les règles déterministes appliquées; il ne constitue pas un benchmark exécuté.

## Vérification

Le workflow SHRE expose une vérification causale après le contre-test et bloque la clôture appliquée sans résultat positif. Aucun résultat CyberCorp de production ni qualification de benchmark n'est revendiqué dans cette implémentation.
