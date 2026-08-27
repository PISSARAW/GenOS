class ConditionalMerge:
    def __init__(self, confidence_threshold=0.8):
        self.confidence_threshold = confidence_threshold

    def evaluate_merge(self, source_branch, target_branch, confidence_score):
        if confidence_score >= self.confidence_threshold:
            return self._execute_merge(source_branch, target_branch)
        else:
            return {"status": "rejected", "reason": "Confidence score too low."}

    def _execute_merge(self, source_branch, target_branch):
        # Simulated merge logic
        return {
            "status": "merged",
            "source": source_branch,
            "target": target_branch
        }

    def update_threshold(self, new_threshold):
        if not (0.0 <= new_threshold <= 1.0):
            raise ValueError("Threshold must be between 0 and 1.")
        self.confidence_threshold = new_threshold
