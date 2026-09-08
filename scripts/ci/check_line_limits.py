#!/usr/bin/env python3
"""Backward-compatible entry point for the complete source quality gate."""
from check_code_quality import main


if __name__ == '__main__':
    raise SystemExit(main())
