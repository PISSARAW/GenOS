# ADR 0796 — Raccorder la qualification de coopération à la chaîne native

- Date : 2026-11-04
- Statut : accepté

## Constat

Le précédent pilote exécutait réellement des workers et leurs oracles, mais
construisait manuellement le parent avec un plan vide. Il perdait le génome et
le bail retournés par la fabrique, et appelait directement le fournisseur pour
planifier. Un transport réussi ne démontrait donc pas la chaîne complète.
L'audit du lancement `daemon-output-20261104-123627` sur D: a également reproduit
une fausse expiration : `Date.parse()` appliqué à une échéance Unix numérique
produisait `NaN`, puis zéro milliseconde restante.

## Décision

Le coordinateur en processus passe par `bootstrapMission`, le contrat de
stratégie, les budgets, le corps, l'enveloppe et les protocoles natifs. Son mode
réserve et réclame le bail de mission avec son PID ; un second lancement est
refusé sans révoquer le premier. Le parcours
est explicitement séquentiel et conditionné à une observation vérifiée. Le plan
structurel initial n'autorise aucune réponse métier anticipée. Le plan LLM
validé après le constat est conservé dans le journal GVX et chaque étape demeure
soumise à son contrat et à sa preuve native.

Ce coordinateur n'active pas une topologie collective de morphogenèse. Une
A-Team, Trinity ou une promotion génétique ne sont pas nécessaires pour cette
chaîne séquentielle ; les revendiquer ou promouvoir artificiellement un génome
pour satisfaire un indicateur serait trompeur. Les workers cognitifs utilisent
les génomes existants ResidentDaemon, PopulationSpecialist et
EvidenceBarrierArbiter, importés dans le catalogue isolé et admis normalement.
Le worker `restore_checkpoint` reste déterministe.

Le planificateur utilise `modelRouter` avec l'identité, le run et le budget du
parent. Les allocations et reprises des enfants partagent cette même réserve.
La revue consultative initiale attend le constat, au lieu de déclencher un
autre appel prématuré au modèle.

Le banc conserve les champs de la fabrique, persiste la lignée et attend la
quiescence native, y compris les reprises et remplacements. Il ne réarme pas
l'échéance lors d'une reprise. Les dates ISO et Unix numériques sont traitées
comme le même instant ; une valeur invalide reste expirée.

La consommation d'une preuve de workspace déjà terminée vérifie l'autorité à
la date de sa fin scellée. Elle ne demande pas un nouveau droit d'exécuter au
worker lorsque le parent rassemble les résultats plus tard. Les empreintes,
le quorum, la fin avant échéance, la révocation et le scope restent contrôlés ;
le chemin d'inférence ordinaire continue d'exiger une autorité courante.

La fin du parent soumet les références exactes des oracles délégués à la porte
native, puis requiert un dossier EVIDENCE et la clôture de mission par
l'homéostasie. Le rapport v4 exige une couverture constatée avant de qualifier.

## Limites et vérification

Le scénario porte sur une allocation locale, une réponse contrainte et une
restauration dans une capsule isolée. Aucune promotion dans la source n'est
autorisée. Les tests HTTP contrôlés vérifient le câblage ; seule une exécution
séparée avec un vrai modèle peut qualifier son comportement.

Les tokens du journal fournisseur incluent le parent et tous ses enfants,
y compris les échecs. Une mesure manquante interdit de qualifier. Le coût USD
du fournisseur local ne mesure ni l'électricité ni le coût du matériel.
