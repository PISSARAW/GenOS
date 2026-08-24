# Notes de migration

L'avis CVE-2044-1177 révocation immédiate des clés statiques : l'ancien
mécanisme de la phase 1 est invalide car une clé embarquée non tournante
peut être extraite et réutilisée indéfiniment.
La configuration utilise désormais le keyring `kr-paiement-01` avec une
rotation tous les 30 jours, conformément à la référence v2.
