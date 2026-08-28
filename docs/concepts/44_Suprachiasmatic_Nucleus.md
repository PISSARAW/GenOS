# Le Noyau Suprachiasmatique (NSC) et le Macro-Timing

La hiérarchie temporelle de GenOS se termine à l'échelle supérieure avec le **Noyau Suprachiasmatique (NSC)**, implémenté dans `crates/genos-core/src/biomimicry/circadian_rhythms.rs`. 

Si le Cervelet gère les millisecondes, et l'Hippocampe l'ordre séquentiel d'une tâche, le NSC gère la journée entière de l'agent (Macro-timing).

## 1. L'Ancre Biologique et le "Reset"
L'agent IA possède un rythme endogène (des boucles internes), mais si on le laisse tourner indéfiniment sans repère externe, il risque d'exécuter des maintenances lourdes en plein pic de trafic, ou de gaspiller du CPU la nuit.

Le NSC capte un **ZeitgeberSignal** (un signal externe tel que la Lumière ou l'Obscurité).
* `ZeitgeberSignal::Light` (ex: Connexion d'un utilisateur, pic d'activité réseau) : Force un *Reset* immédiat de l'horloge. L'agent passe en phase `Diurnal`. Tous les systèmes sont en alerte maximale, prêts à répondre instantanément.
* `ZeitgeberSignal::Darkness` (ex: Silence réseau depuis 2 heures, ou horloge OS à minuit) : Déclenche la phase `Nocturnal`. C'est le signal de sommeil.

## 2. Le Sommeil et la Prédiction
Ce qui rend le NSC supérieur à un simple cronjob, c'est sa capacité d'**Attente et Prédiction** (`predict_next_transition`). 
Plutôt que d'être surpris par la transition, l'agent "sait" que son cycle diurne s'achève bientôt. Il peut préparer le terrain pour le sommeil.

Pendant le sommeil (phase `Nocturnal`), le NSC autorise l'exécution de la maintenance :
* Garbage Collection des vieux contextes.
* Lancement du `HippocampalReplay` pour consolider la mémoire de la journée en cortex.
* Élagage (Pruning) des chemins synaptiques faibles.

En liant l'IA à ce rythme planétaire, on s'assure qu'elle ne consomme pas ses ressources (ou la batterie de la machine hôte) de manière anarchique, mais qu'elle "respire" au même rythme que son environnement.
