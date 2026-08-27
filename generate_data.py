import csv
import random
def generer_donnees(nom_fichier="noeuds_10000.csv", nombre_noeuds=10000, graine_aleatoire=42):
    # Fixer la graine pour garantir que les données soient toujours EXACTEMENT les mêmes
    random.seed(graine_aleatoire)
    
    with open(nom_fichier, mode='w', newline='', encoding='utf-8') as fichier:
        writer = csv.writer(fichier)
        # En-têtes du fichier
        writer.writerow(["id_noeud", "x", "y", "z", "masse_gravitationnelle"])
        
        for i in range(nombre_noeuds):
            # Coordonnées dans un espace 3D (ex: ville multi-niveaux ou circuit)
            x = round(random.uniform(0, 10000), 2)
            y = round(random.uniform(0, 10000), 2)
            z = round(random.uniform(0, 2000), 2)
            
            # Paramètre unique pour la "pénalité de sillage" (dynamique)
            masse = round(random.uniform(0.5, 3.0), 3)
            
            writer.writerow([i, x, y, z, masse])
            
    print(f"Fichier '{nom_fichier}' généré avec succès avec {nombre_noeuds} nœuds.")
    print("Ces données sont déterministes : elles seront identiques à chaque exécution de ce script avec la même graine.")
if __name__ == "__main__":
    generer_donnees()
