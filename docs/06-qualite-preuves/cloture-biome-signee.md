# Clôture Biome et preuve worker actuelle

Le scénario nominal de l'adaptateur Biome réutilise un reçu produit par un vrai
worker et deux processus de vérification. L'identité de mission, du worker et du
run viennent de ce reçu ; elles ne sont pas réétiquetées pour la fixture.

Les mutations négatives restent intentionnelles et doivent être refusées :
référence altérée, autre mission, oracle absent, sujet modifié et changement
concurrent de révision entre observation et clôture.

Le booléen `result.verified` d'un ancien format ne remplace pas la vérification
sémantique actuelle. Aucun assouplissement du collecteur de preuves n'est ajouté.
