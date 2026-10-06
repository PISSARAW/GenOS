"""Reconciliation ledger for external effects that must not be blindly retried."""
import sqlite3


def prepare(connection):
    connection.execute("CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, state TEXT NOT NULL)")
    connection.commit()


def state(connection, operation_id):
    row = connection.execute("SELECT state FROM operations WHERE id = ?", (operation_id,)).fetchone()
    return row[0] if row else None


def dispatch_once(connection, operation_id, action):
    if not isinstance(operation_id, str) or not 1 <= len(operation_id) <= 128:
        raise ValueError("invalid operation id")
    prepare(connection)
    with connection:
        connection.execute("INSERT OR IGNORE INTO operations (id, state) VALUES (?, 'in_flight')", (operation_id,))
        current = state(connection, operation_id)
    if current != "in_flight":
        return "reconciliation_required" if current == "uncertain" else current
    claimed = connection.execute("SELECT changes()").fetchone()[0] == 1
    if not claimed:
        return "reconciliation_required"
    try:
        action(operation_id)
    except Exception:
        with connection:
            connection.execute("UPDATE operations SET state = 'uncertain' WHERE id = ?", (operation_id,))
        return "reconciliation_required"
    with connection:
        connection.execute("UPDATE operations SET state = 'confirmed' WHERE id = ?", (operation_id,))
    return "confirmed"


def reconcile(connection, operation_id, confirmed):
    if type(confirmed) is not bool or state(connection, operation_id) not in {"in_flight", "uncertain"}:
        raise ValueError("manual reconciliation requires an unresolved operation")
    with connection:
        connection.execute("UPDATE operations SET state = ? WHERE id = ?",
                           ("confirmed" if confirmed else "not_applied", operation_id))
    return state(connection, operation_id)
