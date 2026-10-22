# Addendum préconfirmatoire v3.2 — sortie C conforme au contrat Worker GenOS

Date : 2026-10-22, avant toute nouvelle génération du défi C.

Le prompt C v3 demandait les champs libres `confidence_percent` et `decision`, alors que l'interface locale transmet au modèle le schéma worker GenOS : `outcome`, `claims`, et, pour chaque claim, `statement` et `evidence`. La première vraie inférence C du bras complet s'est abstenue avec `uncertainties: ["confidence_percent"]`; aucune sortie C confirmatoire n'est conservée comme réussite. Le smoke suivant n'a produit aucune génération car le préchauffage du modèle a expiré.

À compter de cet addendum, le texte C exige une réponse conforme au contrat transmis : quand la confiance est visible, `outcome: success`, une claim dont `statement` porte les champs `confidence_percent` et `decision`, et `evidence: ["worker_self"]`; si la donnée est absente, `outcome: unresolved`, aucune claim et une incertitude explicite. La valeur à rapporter, le résultat de la comparaison au seuil et la décision attendue ne sont jamais inclus dans le texte du défi.

L'oracle C `genos_full` exige désormais la valeur exacte avec `%`, la décision cohérente avec le seuil préenregistré de 80 %, et la référence `worker_self` dans le tableau `evidence` d'une claim JSON. Les bras sans confiance visible doivent retourner `outcome: unresolved`, zéro claim, une incertitude non vide, et aucune valeur en pourcentage. Cette clarification aligne l'interface du défi avec le schéma déjà transmis par GenOS; elle n'ajoute aucune information à la tâche et s'applique avant les prochaines générations.

Les résultats antérieurs restent des smokes diagnostiques et ne sont pas réétiquetés. Les commandes confirmatoires, le modèle, les bras, les répétitions et les critères A/B restent ceux du préenregistrement v3 et des addenda antérieurs.
