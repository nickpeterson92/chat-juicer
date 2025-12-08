# Chat Juicer Code Interpreter Sandbox
# Secure Python execution environment with data science stack
#
# Build: docker build -t chat-juicer-sandbox:latest docker/sandbox/
# Size: ~700MB (Python 3.13 slim + data science packages)

FROM python:3.13-slim

# ============================================
# LATENCY OPTIMIZATIONS
# ============================================
# Skip .pyc generation at runtime (we precompile at build time)
ENV PYTHONDONTWRITEBYTECODE=1
# Unbuffered output for real-time streaming
ENV PYTHONUNBUFFERED=1
# Non-interactive matplotlib backend (no display required)
ENV MPLBACKEND=Agg
# Matplotlib config directory (avoid read-only filesystem warnings)
ENV MPLCONFIGDIR=/tmp
# Disable pip version check for faster installs
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
# Use pip cache for faster rebuilds
ENV PIP_NO_CACHE_DIR=0

# ============================================
# SYSTEM SETUP
# ============================================
# Create non-root user for security (UID 1000)
RUN groupadd -g 1000 sandbox && \
    useradd -u 1000 -g sandbox -m -s /bin/bash sandbox

# Install minimal system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Required for some Python packages
    libgomp1 \
    # Document conversion (markdown, docx, html, etc.)
    pandoc \
    # Cleanup to reduce image size
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# ============================================
# PYTHON PACKAGES - TIERED INSTALLATION
# ============================================
# Install packages in tiers for better caching

# Tier 1: Core data science (most commonly used)
RUN pip install --no-cache-dir \
    numpy==2.2.2 \
    pandas==2.2.3 \
    matplotlib==3.10.0 \
    scipy==1.15.1

# Tier 2: Extended data science
RUN pip install --no-cache-dir \
    seaborn==0.13.2 \
    scikit-learn==1.6.1 \
    pillow==11.1.0 \
    sympy==1.13.3

# Tier 3: Office document handling
RUN pip install --no-cache-dir \
    openpyxl==3.1.5 \
    python-docx==1.1.2 \
    pypdf==5.1.0 \
    python-pptx==1.0.2

# Tier 4: Utilities
RUN pip install --no-cache-dir \
    tabulate==0.9.0 \
    faker==33.3.1 \
    python-dateutil==2.9.0 \
    humanize==4.11.0 \
    pyyaml==6.0.2 \
    lxml==5.3.0 \
    pypandoc==1.14

# Tier 5: Visualization
RUN pip install --no-cache-dir \
    plotly==5.24.1

# ============================================
# PRECOMPILATION FOR FASTER STARTUP
# ============================================
# Precompile all .py files to .pyc at build time
RUN python -m compileall -q /usr/local/lib/python3.13

# ============================================
# ENTRYPOINT SCRIPT FOR WARM CONTAINER
# ============================================
COPY entrypoint.py /opt/entrypoint.py
RUN chmod +x /opt/entrypoint.py && \
    chown sandbox:sandbox /opt/entrypoint.py

# ============================================
# WORKSPACE SETUP
# ============================================
# Create workspace directory with correct permissions
RUN mkdir -p /workspace && \
    chown -R sandbox:sandbox /workspace

# Set working directory
WORKDIR /workspace

# Switch to non-root user
USER sandbox

# Default command (can be overridden)
CMD ["python"]
