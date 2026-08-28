class Symbiosis:
    def __init__(self):
        self.relationships = {}

    def establish_relationship(self, agent_a, agent_b):
        self.relationships[(agent_a, agent_b)] = "symbiotic"

    def get_relationship(self, agent_a, agent_b):
        return self.relationships.get((agent_a, agent_b))
