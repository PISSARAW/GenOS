class Ecology:
    def __init__(self):
        self.agents = []

    def add_agent(self, agent_id):
        if agent_id not in self.agents:
            self.agents.append(agent_id)

    def get_agents(self):
        return self.agents
