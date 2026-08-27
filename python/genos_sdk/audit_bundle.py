import json
import hashlib
from datetime import datetime

class AuditBundle:
    def __init__(self, run_id, environment):
        self.run_id = run_id
        self.environment = environment
        self.events = []
        self.created_at = datetime.utcnow().isoformat()

    def add_event(self, event_type, details):
        self.events.append({
            "type": event_type,
            "details": details,
            "timestamp": datetime.utcnow().isoformat()
        })

    def seal_bundle(self):
        data = {
            "run_id": self.run_id,
            "environment": self.environment,
            "created_at": self.created_at,
            "events": self.events
        }
        raw_data = json.dumps(data, sort_keys=True)
        signature = hashlib.sha256(raw_data.encode('utf-8')).hexdigest()
        return {
            "data": data,
            "signature": signature
        }

    def export(self, filepath):
        sealed = self.seal_bundle()
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(sealed, f, indent=2)
        return filepath
