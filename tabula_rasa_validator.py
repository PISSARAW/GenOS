class TabulaRasaValidator:
    """Tabula Rasa: Validateur impartial des environnements."""

    def __init__(self):
        self.grille_taille_x = 20
        self.grille_taille_y = 20

    def valider_grille(self, grille: list[list[int]]) -> bool:
        """Valide si la grille est exactement 20x20 avec bords morts (non toroïdale)."""
        if len(grille) != self.grille_taille_y:
            return False
        for ligne in grille:
            if len(ligne) != self.grille_taille_x:
                return False
        return True

    def valider_espace_discret(self, grille: list[list[int]]) -> bool:
        """Valide que l'espace ne contient que des 0 ou 1 (aucun flottant)."""
        for ligne in grille:
            for cellule in ligne:
                if not isinstance(cellule, int):
                    return False
                if cellule not in (0, 1):
                    return False
        return True

    def valider_entropie(self, algorithme_nom: str, affronte_entropie: bool) -> bool:
        """Valide si l'algorithme tente d'affronter l'entropie."""
        if not affronte_entropie:
            print(f"[{algorithme_nom}] Rejet: Contournement de l'entropie.")
            return False
        return True

    def executer_validation(self, agent: str, grille: list, affronte: bool) -> bool:
        """Exécute la validation complète pour un agent."""
        if not self.valider_grille(grille):
            print(f"[{agent}] Echec: Grille invalide (non 20x20 ou bords non morts).")
            return False
        if not self.valider_espace_discret(grille):
            print(f"[{agent}] Echec: Espace non discret (valeurs hors 0/1).")
            return False
        if not self.valider_entropie(agent, affronte):
            return False
        
        print(f"[{agent}] Validation Tabula Rasa : ACCEPTEE.")
        return True
