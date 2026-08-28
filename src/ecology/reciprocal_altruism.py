class ReciprocalAltruism:
    def __init__(self):
        self.trust_ledger = {}

    def update_trust(self, agent, delta):
        self.trust_ledger[agent] = self.trust_ledger.get(agent, 0) + delta

    def get_trust(self, agent):
        return self.trust_ledger.get(agent, 0)
