#!/usr/bin/env python3
"""
Entrypoint script for warm container pre-warming.

This script pre-imports commonly used packages to eliminate import latency
for subsequent code executions. The warm container keeps these in memory.

Usage:
  - Container runs with: python /opt/entrypoint.py
  - Waits for code execution requests via stdin
  - Each line on stdin is a path to a Python script to execute
"""

import sys

# ============================================
# PRE-IMPORT HEAVY PACKAGES
# These imports happen once when container starts
# Subsequent executions skip ~1-2s of import time
# ============================================

# Core data science
import numpy as np
import pandas as pd

# Matplotlib with Agg backend (set via ENV)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# Extended data science
import scipy
import seaborn as sns
from sklearn import preprocessing  # Pre-warm sklearn

# Imaging
from PIL import Image

# Math
import sympy

# Office documents
import openpyxl
import docx
import pypdf
import pptx

# Utilities
import tabulate
import faker
import dateutil
import humanize
import yaml
import lxml

# Visualization
import plotly

# ============================================
# SIGNAL READY
# ============================================
print("SANDBOX_READY", flush=True)

# ============================================
# WAIT FOR EXECUTION REQUESTS
# ============================================
# In warm mode, we wait for script paths on stdin
# Each line triggers execution of that script
# Exit when stdin closes (container shutdown)

def main():
    """Main loop for warm container mode."""
    for line in sys.stdin:
        script_path = line.strip()
        if not script_path:
            continue

        try:
            # Execute the script
            with open(script_path, 'r') as f:
                code = f.read()

            # Create isolated namespace for execution
            namespace = {
                '__name__': '__main__',
                '__file__': script_path,
            }

            exec(compile(code, script_path, 'exec'), namespace)

            print("EXECUTION_COMPLETE", flush=True)
        except Exception as e:
            print(f"EXECUTION_ERROR: {e}", file=sys.stderr, flush=True)
            print("EXECUTION_COMPLETE", flush=True)


if __name__ == '__main__':
    main()
