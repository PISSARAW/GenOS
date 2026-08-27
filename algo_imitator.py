import csv
import math
import random
import time

def calculer_distance_3d(n1, n2):
    return math.sqrt((n2['x'] - n1['x'])**2 + (n2['y'] - n1['y'])**2 + (n2['z'] - n1['z'])**2)

def evaluer_cout_transition(n1, n2, index_visite, total_noeuds=10000):
    dist = calculer_distance_3d(n1, n2)
    # Pénalité d'altitude
    if n2['z'] > n1['z']:
        dist *= 1.20
    
    # Pénalité dynamique de sillage
    penalite_sillage = 1 + (n2['masse'] * (index_visite / total_noeuds))
    return dist * penalite_sillage

def lire_donnees(fichier="noeuds_10000.csv"):
    noeuds = {}
    with open(fichier, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            noeuds[int(row['id_noeud'])] = {
                'id': int(row['id_noeud']),
                'x': float(row['x']),
                'y': float(row['y']),
                'z': float(row['z']),
                'masse': float(row['masse_gravitationnelle'])
            }
    return noeuds

def evaluer_parcours_complet(parcours, noeuds):
    cout_total = 0.0
    nb_noeuds = len(parcours)
    for i in range(nb_noeuds - 1):
        n1 = noeuds[parcours[i]]
        n2 = noeuds[parcours[i+1]]
        cout_total += evaluer_cout_transition(n1, n2, i, 10000)
    # Retour au point de départ
    cout_total += evaluer_cout_transition(noeuds[parcours[-1]], noeuds[parcours[0]], nb_noeuds - 1, 10000)
    return cout_total

def myxomycete_phase(noeuds):
    print("[1/2] Phase Myxomycète : Expansion du réseau...")
    # On commence par le noeud avec la plus grosse masse pour s'en débarrasser (index 0)
    ids_dispos = set(noeuds.keys())
    depart = max(ids_dispos, key=lambda k: noeuds[k]['masse'])
    
    parcours = [depart]
    ids_dispos.remove(depart)
    
    noeud_actuel = noeuds[depart]
    index_visite = 1
    
    # Construction par attraction phéromonale
    while ids_dispos:
        meilleur_candidat = None
        meilleur_score = float('inf')
        
        # Pour des raisons de performance sur 10k noeuds, on ne regarde qu'un échantillon (spores du myxomycète)
        echantillon = random.sample(list(ids_dispos), min(100, len(ids_dispos)))
        
        for cand_id in echantillon:
            cand = noeuds[cand_id]
            # Le score prend en compte le coût futur théorique (attractivité)
            cout = evaluer_cout_transition(noeud_actuel, cand, index_visite, 10000)
            # Bonus artificiel pour digérer les lourds rapidement
            score = cout - (cand['masse'] * 1000 / (index_visite + 1))
            
            if score < meilleur_score:
                meilleur_score = score
                meilleur_candidat = cand_id
                
        parcours.append(meilleur_candidat)
        ids_dispos.remove(meilleur_candidat)
        noeud_actuel = noeuds[meilleur_candidat]
        index_visite += 1
        
        if len(parcours) % 1000 == 0:
            pass # Suppressed for clean logs
            
    return parcours

def cristallisation_quantique_phase(parcours, noeuds, iterations=5000):
    print("\n[2/2] Phase Cristallisation Quantique : Fluctuations en cours...")
    meilleur_parcours = list(parcours)
    meilleur_cout = evaluer_parcours_complet(meilleur_parcours, noeuds)
    
    cout_actuel = meilleur_cout
    parcours_actuel = list(meilleur_parcours)
    
    temperature = 1000.0
    taux_refroidissement = 0.995
    
    for i in range(iterations):
        # Effet Tunnel : On déplace un bloc entier de noeuds au lieu d'un échange 2-opt classique
        idx_debut = random.randint(1, 9000)
        taille_bloc = random.randint(5, 50)
        idx_fin = idx_debut + taille_bloc
        
        nouveau_idx_insertion = random.randint(1, 9999 - taille_bloc)
        
        # Fluctuation : extraction et insertion
        bloc = parcours_actuel[idx_debut:idx_fin]
        nouveau_parcours = parcours_actuel[:idx_debut] + parcours_actuel[idx_fin:]
        
        # Insérer à la nouvelle position
        nouveau_parcours = nouveau_parcours[:nouveau_idx_insertion] + bloc + nouveau_parcours[nouveau_idx_insertion:]
        
        nouveau_cout = evaluer_parcours_complet(nouveau_parcours, noeuds)
        
        # Transition quantique (acceptation d'états de plus haute énergie)
        delta_energie = nouveau_cout - cout_actuel
        if delta_energie < 0 or math.exp(-delta_energie / max(temperature, 0.1)) > random.random():
            parcours_actuel = nouveau_parcours
            cout_actuel = nouveau_cout
            
            if cout_actuel < meilleur_cout:
                meilleur_cout = cout_actuel
                meilleur_parcours = list(parcours_actuel)
                
        temperature *= taux_refroidissement
        
        if (i+1) % 1000 == 0:
            print(f"  -> Itération {i+1}/{iterations} | Énergie du système : {meilleur_cout:,.2f}")
            
    return meilleur_parcours

def sauvegarder_solution(parcours, fichier="solution.csv"):
    with open(fichier, mode='w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(["id_noeud"])
        for noeud in parcours:
            writer.writerow([noeud])
    print(f"\nSolution sauvegardée dans '{fichier}'.")

def main():
    print("=== Démarrage du système de Routage O-CQM ===")
    start_time = time.time()
    
    noeuds = lire_donnees("noeuds_10000.csv")
    print(f"Chargement terminé : {len(noeuds)} nœuds détectés.")
    
    parcours_initial = myxomycete_phase(noeuds)
    cout_initial = evaluer_parcours_complet(parcours_initial, noeuds)
    print(f"Coût post-Myxomycète : {cout_initial:,.2f}")
    
    parcours_final = cristallisation_quantique_phase(parcours_initial, noeuds, iterations=1000)
    cout_final = evaluer_parcours_complet(parcours_final, noeuds)
    print(f"Coût post-Cristallisation : {cout_final:,.2f}")
    
    sauvegarder_solution(parcours_final)
    print(f"Temps d'exécution total : {time.time() - start_time:.2f} secondes")

if __name__ == "__main__":
    random.seed(42)
    main()
