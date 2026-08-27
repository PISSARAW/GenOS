import csv
import math
import random
import time

def calculer_distance_3d(n1, n2):
    return math.sqrt((n2['x'] - n1['x'])**2 + (n2['y'] - n1['y'])**2 + (n2['z'] - n1['z'])**2)

def evaluer_cout_transition(n1, n2, index_visite, total_noeuds=10000):
    dist = calculer_distance_3d(n1, n2)
    if n2['z'] > n1['z']:
        dist *= 1.20
    penalite_sillage = 1 + (n2['masse'] * (index_visite / total_noeuds))
    return dist * penalite_sillage

def lire_donnees(fichier="noeuds_10000.csv"):
    noeuds = []
    with open(fichier, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            noeuds.append({
                'id': int(row['id_noeud']),
                'x': float(row['x']),
                'y': float(row['y']),
                'z': float(row['z']),
                'masse': float(row['masse_gravitationnelle'])
            })
    return noeuds

def evaluer_parcours_complet(parcours, noeuds_dict):
    cout_total = 0.0
    nb_noeuds = len(parcours)
    for i in range(nb_noeuds - 1):
        n1 = noeuds_dict[parcours[i]]
        n2 = noeuds_dict[parcours[i+1]]
        cout_total += evaluer_cout_transition(n1, n2, i, 10000)
    cout_total += evaluer_cout_transition(noeuds_dict[parcours[-1]], noeuds_dict[parcours[0]], nb_noeuds - 1, 10000)
    return cout_total

# YAHN : Algorithme de Stratification Spatiale de Morton
# Totalement non-glouton (pas de recherche locale) : Tri purement fonctionnel
def entrelacer_bits(x, y, z):
    # Simplification du code de Morton (Z-order)
    def separer_bits(n):
        n &= 0x000003ff
        n = (n ^ (n << 16)) & 0xff0000ff
        n = (n ^ (n <<  8)) & 0x0300f00f
        n = (n ^ (n <<  4)) & 0x030c30c3
        n = (n ^ (n <<  2)) & 0x09249249
        return n
    return separer_bits(int(x)) | (separer_bits(int(y)) << 1) | (separer_bits(int(z)) << 2)

def algo_yahn(noeuds):
    for n in noeuds:
        n['z_code'] = entrelacer_bits(n['x']/10, n['y']/10, n['z']/2)
    # Stratification : on divise en 5 groupes de masse décroissante
    noeuds_tries = sorted(noeuds, key=lambda n: (-int(n['masse'] * 2), n['z_code']))
    return [n['id'] for n in noeuds_tries]

# BOAZ : Algorithme de Pulsation Radiale
# Totalement non-glouton : Tri par distance au centre
def algo_boaz(noeuds):
    centre_x, centre_y, centre_z = 5000, 5000, 1000
    for n in noeuds:
        n['dist_centre'] = math.sqrt((n['x']-centre_x)**2 + (n['y']-centre_y)**2 + ((n['z']-centre_z)*5)**2)
    noeuds_tries = sorted(noeuds, key=lambda n: n['dist_centre'])
    return [n['id'] for n in noeuds_tries]

def main():
    noeuds = lire_donnees("noeuds_10000.csv")
    noeuds_dict = {n['id']: n for n in noeuds}
    
    t0 = time.time()
    parcours_yahn = algo_yahn(noeuds)
    t_yahn = time.time() - t0
    cout_yahn = evaluer_parcours_complet(parcours_yahn, noeuds_dict)
    print(f"YAHN -> Cout: {cout_yahn:,.2f} | Temps: {t_yahn:.4f}s")
    
    t0 = time.time()
    parcours_boaz = algo_boaz(noeuds)
    t_boaz = time.time() - t0
    cout_boaz = evaluer_parcours_complet(parcours_boaz, noeuds_dict)
    print(f"BOAZ -> Cout: {cout_boaz:,.2f} | Temps: {t_boaz:.4f}s")

if __name__ == "__main__":
    main()
