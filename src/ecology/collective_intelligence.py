class CollectiveIntelligence:
    def __init__(self):
        self.stigmergy_map = {}

    def leave_pheromone(self, location, intensity):
        self.stigmergy_map[location] = intensity

    def read_pheromone(self, location):
        return self.stigmergy_map.get(location, 0)
