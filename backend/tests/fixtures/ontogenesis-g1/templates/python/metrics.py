"""Small metrics module for the Ontogenesis G1 pilot."""

import math


def average(values):
    if not isinstance(values, (list, tuple)):
        raise TypeError("values must be a list or tuple")
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in values):
        raise TypeError("values must be finite numbers")
    if not values:
        return 0
    return sum(values) / len(values)


def percentile(values, p):
    if not isinstance(values, (list, tuple)):
        raise TypeError("values must be a list or tuple")
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in values):
        raise TypeError("values must be finite numbers")
    if not isinstance(p, (int, float)) or not 0 <= p <= 100:
        raise ValueError("p must be between 0 and 100")
    if not values:
        return None
    ordered = sorted(values)
    return ordered[int((p / 100) * len(ordered))] if int((p / 100) * len(ordered)) < len(ordered) else None


def summary(values):
    if not isinstance(values, (list, tuple)):
        raise TypeError("values must be a list or tuple")
    if any(not isinstance(value, (int, float)) for value in values):
        raise TypeError("values must be numbers")
    total = sum(values)
    return {
        "count": len(values),
        "sum": total,
        "average": total / len(values) if values else 0,
        "min": min(values) if values else None,
        "max": max(values) if values else None,
    }
