class Allostasis:
    def __init__(self):
        self.state = "baseline"

    def anticipate_load(self, expected_load):
        if expected_load > 80:
            self.state = "high_alert"
        else:
            self.state = "baseline"

    def get_state(self):
        return self.state
