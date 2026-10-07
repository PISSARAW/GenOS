"""Bounded PyPhi 1.2.0/IIT 3.0 adapter; never replace Phi with a proxy."""
import contextlib
import importlib.util
import json
import math
import sys


def validate(data):
    state = data.get('state', [])
    count = len(state)
    if not 1 <= count <= 4 or any(bit not in (0, 1) for bit in state):
        raise ValueError('Only 1-4 binary nodes are supported.')
    tpm = data.get('tpm', [])
    if len(tpm) != 2 ** count:
        raise ValueError('Full little-endian interventional TPM required.')
    for row in tpm:
        if len(row) != count or any(not isinstance(p, (int, float)) or not 0 <= p <= 1 for p in row):
            raise ValueError('Invalid state-by-node TPM probabilities.')
    if data.get('conditionalIndependence') is not True:
        raise ValueError('Explicit conditional independence assumption required.')
    if data.get('tpmKind') != 'interventional':
        raise ValueError('An observational correlation matrix is not an interventional TPM.')


def compute(data):
    validate(data)
    if importlib.util.find_spec('pyphi') is None:
        return {'status': 'not_run', 'reason': 'pyphi_not_installed', 'phi': None}
    # PyPhi import/log output must not corrupt the JSON protocol.
    with contextlib.redirect_stdout(sys.stderr):
        import pyphi
        if pyphi.__version__ != '1.2.0':
            return {'status': 'not_run', 'reason': 'unsupported_pyphi_version', 'phi': None}
        with pyphi.config.override(PROGRESS_BARS=False, PARALLEL_CONCEPT_EVALUATION=False,
                                   PARALLEL_CUT_EVALUATION=False, PARALLEL_COMPLEX_EVALUATION=False):
            network = pyphi.Network(data['tpm'])
            subsystem = pyphi.Subsystem(network, tuple(data['state']))
            phi = float(pyphi.compute.phi(subsystem))
    if not math.isfinite(phi) or phi < 0:
        raise ValueError('Invalid Phi output.')
    return {'status': 'computed', 'phi': phi, 'engine': 'pyphi@1.2.0',
            'theory': 'IIT-3.0', 'boundary': 'declared-binary-subsystem',
            'promotionAllowed': False}


def main():
    try:
        result = compute(json.load(sys.stdin))
    except Exception as error:
        result = {'status': 'not_run', 'reason': 'phi_computation_failed',
                  'detail': str(error), 'phi': None, 'promotionAllowed': False}
    print(json.dumps(result, allow_nan=False))


if __name__ == '__main__':
    main()
