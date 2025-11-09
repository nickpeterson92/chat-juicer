#!/bin/bash
# Run all tests with coverage reporting
#
# Note: Uses coverage.py directly instead of pytest-cov plugin.
# This avoids parallel mode issues on some systems while providing
# identical coverage measurement.

cd "$(dirname "$0")/.." || exit 1

# Run tests with coverage
COVERAGE_FILE=.coverage \
.juicer/bin/coverage run \
    --source=src \
    --omit='tests/*,**/__pycache__/*' \
    -m pytest tests/ -q

# Display coverage report
echo ""
.juicer/bin/coverage report --skip-empty
