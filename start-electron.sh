#!/bin/bash

# Unset the problematic environment variable
unset ELECTRON_RUN_AS_NODE

# Disable code signing verification for development
export ELECTRON_DISABLE_SECURITY_WARNINGS=true

# Start Electron
exec npx electron .
