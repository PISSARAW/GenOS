# Hiérarchie préadmise et délégation récursive LLM dans Rust

**Statut** : Accepté pour une arborescence bornée de rôles préadmis  
**Date** : 2026-11-04  
**Domaine** : Runtime Rust, délégation, contextes, CAS et clôture des preuves  
**Lié à** : [Orchestration dynamique](0786-orchestration-dynamique-et-delegation-llm-rust.md)

## Contexte

Le profil dynamique initial permet à une racine de distribuer des tâches à
des workers dormants. Un worker ne peut pas devenir à son tour parent. Une
hiérarchie demande de distinguer la tâche reçue d'un ancêtre, les tâches
émises vers les enfants directs et leurs retours. Les tours de deux agents
différents ne constituent pas une horloge commune.

## Décision

Ajouter à `orchestration` une option `hierarchy` contenant une table
`parents` enfant → parent unique, `max_depth` entre 1 et 4 et
`max_children` entre 1 et 4. La racine a une profondeur nulle. Tous les
rôles, instructions, outils et fournisseurs restent admis avant le premier
appel modèle. Le profil hiérarchique accepte au plus huit agents et une
largeur d'exécution au plus égale à quatre.

L'arbre couvre tous les rôles hors racine, est connecté et sans cycle.
Chaque slot reçoit au plus une affectation. Un intermédiaire ne peut
utiliser `delegate_task` que s'il possède ce droit admis, est lui-même
activé par une affectation authentique et cible un de ses enfants directs.
Une tâche émise par le modèle ne crée aucun droit ni aucune identité.

L'enregistrement conserve dans une seule transaction le reçu natif d'outil,
l'affectation, l'activation MORPH et la livraison CAS de la tâche. Il
confirme l'enregistrement de la tâche ; la complétion du destinataire
provient ensuite d'une observation modèle terminale réelle.

## Contextes et échanges

Un contexte de parent au tour `t` ne lit que ses affectations sortantes
dont `parent.agent_id` est cet agent et `parent.turn < t`. Le filtrage
précède la validation des lignes pour préserver les anciens contextes. Un
intermédiaire conserve sa tâche entrante et consomme les véritables retours
de ses enfants directs. Son catalogue d'enfants disponibles utilise le
même préfixe historique et l'arbre admis.

La tâche est copiée dans des espaces CAS distincts de l'émetteur et du
destinataire, sans exiger une fausse complétion du parent. Un retour exige
le vrai `CompletedAgent` de l'enfant, ses artefacts immuables et une copie
réellement rehashée vers son parent effectif. Le reçu fixe
`return_turn = parent.turn + 1`. Les événements GQWF originaux et les
index sont revérifiés à la lecture.

La racine ne reçoit pas automatiquement les données privées des
petits-enfants. Le droit de lecture d'artefact porte sur soi et sur les
retours directs autorisés ; il n'est pas transitif. La clôture globale peut
néanmoins contenir la provenance de tout l'arbre pour son vérificateur
local de confiance.

## Ordonnancement, reprise et budgets

La préparation atomique des contextes, réservations, intentions et vagues
reste celle du profil parallèle. Tout parent actif attend les retours
requis avant son prochain tour. Une vague portant l'enregistrement d'une
délégation se clôt avant l'exécution ultérieure de ses descendants.

Les descendants partagent les budgets et la réserve protégée de la
mission. Une délégation, une annulation ou une reprise ne recharge aucun
quota. Une observation inconnue conserve son exposition et bloque une
nouvelle émission. Une observation connue se réconcilie sans nouvel HTTP.

## Fenêtre d'admission H2

La première version H1 héritait d'un plafond de mission de 180 000 ms.
Le quatrième essai réel à cinq rôles a progressé jusqu'aux retours des
feuilles et aux résumés des parents, puis a expiré sans publication.
Cette observation motive une évolution explicite du contrat d'admission ;
elle ne démontre pas une durée générale du modèle ni la cause des
autres issues inconnues.

H2 admet une fenêtre de mission allant jusqu'à 600 000 ms uniquement si
la configuration agentique Rust effectivement chargée possède
`orchestration.hierarchy: Some(...)` et satisfait tous les contrôles de
l'arbre. Les profils statique et dynamique plat restent plafonnés à
180 000 ms. Le plafond de parsing CLI ne constitue pas une autorisation :
la route Rust agentique puis le type réel de configuration doivent
confirmer le profil avant l'admission.

Le budget cumulé `limits.wall_ms` reste borné par la fenêtre admise.
Une allocation typique H2 est 570 000 ms pour une fenêtre de 600 000 ms.
La réserve protégée de 5 % demeure inchangée ; chaque requête HTTP reste
plafonnée à 180 000 ms et aux bornes plus petites issues du budget,
du contexte et du bail courant. Aucun outil, rôle, token ou appel
supplémentaire n'est accordé implicitement par cette fenêtre.

Les missions H1, leurs baux, leurs inconnus et leurs empreintes restent
immuables. H2 ne prolonge pas un ancien bail et ne libère aucune exposition
H1. Une qualification H2 exige une nouvelle admission avec ses conditions
déclarées, un ensemble source gelé de 23 fichiers, un nouveau pin et de
nouveaux reçus. Les résultats H1 sont historiques ; ils ne certifient pas
les sources H2. Aucun essai réel H2 n'est lancé avant gel, compilation,
validation et autorisation explicite du nouveau pin.

## Preuves et succession

La clôture EVIDENCE couvre chaque appel natif de délégation accepté, son
affectation, l'activation MORPH, la tâche livrée, la complétion de l'enfant,
le retour copié et les contextes qui le consomment. La couverture est
bijective dans les deux sens. Les rôles restés dormants sont explicitement
inutilisés, sans observations ni complétions inventées.

CONTINUITY refuse une succession si un descendant ou un retour reste en
attente, même lorsque les montants exposés sont nuls et les vagues jointes.
Ce contrôle des effets réglés n'exige pas à lui seul la complétion finale
de la racine. La publication exige en plus la clôture complète, les
méthodes de contrat installées et les gardes d'autorité courantes. Elle
conserve la tête CAS, le reçu de publication, l'événement OMEGA et le
statut terminé dans la même transaction SQLite.

## Compatibilité et limites

Lorsque `hierarchy` est absent, les représentations et branches du profil
dynamique plat restent inchangées. Les hashes des contextes, reçus et
clôtures de ce profil restent utilisables au rejeu.

Cette hiérarchie choisit des tâches dans un arbre fixé par l'opérateur.
Elle ne crée pas librement des agents et ne reconfigure pas leurs droits.
Les méthodes locales vérifient le contrat structurel de l'artefact ; elles
ne prouvent aucune vérité sémantique, indépendance statistique, concurrence
de calcul du fournisseur ou autorité d'effet externe. La portée de
publication conserve `semantic_truth_verified: false`,
`promotable: false` et `external_effects_authorized: false`.
