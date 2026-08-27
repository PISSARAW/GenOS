import csv
import math
import random
import time

def lire_noeuds(nom_fichier):
    noeuds = []
    with open(nom_fichier, mode='r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader)
        for row in reader:
            noeuds.append({
                'id': int(row[0]),
                'x': float(row[1]),
                'y': float(row[2]),
                'z': float(row[3]),
                'masse': float(row[4])
            })
    return noeuds

def calculer_cout_dynamique(noeud_a, noeud_b, index_visite, total_noeuds):
    dx = noeud_b['x'] - noeud_a['x']
    dy = noeud_b['y'] - noeud_a['y']
    dz = noeud_b['z'] - noeud_a['z']
    distance = math.sqrt(dx*dx + dy*dy + dz*dz)
    penalite_alt = 1.2 if dz > 0 else 1.0
    penalite_masse = 1.0 + (noeud_b['masse'] * (index_visite / float(total_noeuds)))
    return distance * penalite_alt * penalite_masse

def etendre_pseudopode(actuel, non_visites_dict, index_visite, total_noeuds):
    cles = list(non_visites_dict.keys())
    if not cles:
        return None
    taille_echantillon = min(len(cles), 45)
    candidats_cles = random.sample(cles, taille_echantillon)
    meilleur_noeud = None
    cout_minimum = float('inf')
    for cle in candidats_cles:
        candidat = non_visites_dict[cle]
        cout = calculer_cout_dynamique(actuel, candidat, index_visite, total_noeuds)
        if cout < cout_minimum:
            cout_minimum = cout
            meilleur_noeud = candidat
    return meilleur_noeud

def resoudre_ormg(noeuds):
    non_visites = {n['id']: n for n in noeuds[1:]}
    actuel = noeuds[0]
    parcours = [actuel['id']]
    index_visite = 0
    total_noeuds = len(noeuds)
    while non_visites:
        prochain = etendre_pseudopode(actuel, non_visites, index_visite, total_noeuds)
        if not prochain:
            break
        parcours.append(prochain['id'])
        del non_visites[prochain['id']]
        actuel = prochain
        index_visite += 1
    return parcours

def ecrire_solution(parcours, nom_fichier):
    with open(nom_fichier, mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["id_noeud"])
        for p in parcours:
            writer.writerow([p])

if __name__ == "__main__":
    random.seed(42)
    start_time = time.time()
    
    # 1. Generate data
    print("Generation des donnees...")
    with open("noeuds_10000.csv", mode='w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(["id_noeud", "x", "y", "z", "masse_gravitationnelle"])
        for i in range(10000):
            x = round(random.uniform(0, 10000), 2)
            y = round(random.uniform(0, 10000), 2)
            z = round(random.uniform(0, 2000), 2)
            masse = round(random.uniform(0.5, 3.0), 3)
            writer.writerow([i, x, y, z, masse])
            
    print("Donnees generees. Lecture...")
    noeuds = lire_noeuds("noeuds_10000.csv")
    print(f"{len(noeuds)} noeuds charges. Resolution en cours (ORMG)...")
    
    parcours = resoudre_ormg(noeuds)
    
    print(f"Resolution terminee. Ecriture de la solution ({len(parcours)} noeuds visites)...")
    ecrire_solution(parcours, "solution.csv")
    
    elapsed = time.time() - start_time
    print(f"Succes ! Temps total : {elapsed:.2f} secondes.")
