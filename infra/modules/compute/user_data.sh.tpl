#!/bin/bash
set -x

# 1. Install System Dependencies
# Amazon Linux 2023 uses dnf
dnf update -y
dnf install -y git python3.11 python3-pip docker

# 2. Setup Docker
systemctl enable --now docker
usermod -aG docker ec2-user

# Install Docker Compose (Standalone for compatibility with scripts)
curl -SL https://github.com/docker/compose/releases/download/v2.24.1/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose

# 3. Setup Directories & Permissions
mkdir -p /opt/chat-juicer
chown ec2-user:ec2-user /opt/chat-juicer

# 4. Clone Repository (as ec2-user)
# Using PAT for authentication
sudo -u ec2-user git clone https://${github_token}@github.com/nickpeterson92/chat-juicer.git /opt/chat-juicer

# 5. Configure Environment
cd /opt/chat-juicer

# Create .env from template variables
cat <<EOF > src/backend/.env
APP_ENV=production
CONFIG_HOT_RELOAD=false
API_PROVIDER=azure
API_PORT=8000
API_HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://${db_username}:${db_password}@${db_endpoint}/chatjuicer
DB_POOL_MIN_SIZE=5
DB_POOL_MAX_SIZE=40

# Storage
FILE_STORAGE=s3
S3_BUCKET=${s3_bucket}
S3_REGION=${aws_region}

# Azure OpenAI
AZURE_OPENAI_API_KEY=${azure_openai_api_key}
AZURE_OPENAI_ENDPOINT=${azure_openai_endpoint}
REASONING_EFFORT=medium

# MCP & Scaling
TAVILY_API_KEY=${tavily_api_key}
MCP_ACQUIRE_TIMEOUT=30.0
SANDBOX_POOL_SIZE=15
WS_MAX_CONNECTIONS=500

# Auth
JWT_SECRET=${jwt_secret}
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRES_MINUTES=60
REFRESH_TOKEN_EXPIRES_DAYS=7
DEFAULT_USER_EMAIL=local@chatjuicer.dev
ALLOW_LOCALHOST_NOAUTH=false

# Salesforce
SF_USER=${sf_user}
SF_PASSWORD=${sf_password}
SF_TOKEN=${sf_token}

# Logging
OPENAI_AGENTS_DISABLE_TRACING=true
HTTP_REQUEST_LOGGING=false
HTTP_READ_TIMEOUT=600.0

# CORS
CORS_ALLOW_ORIGINS=app://.,https://chat-juicer.com,https://api.chat-juicer.com

# Registration restriction
REGISTRATION_INVITE_CODE=${registration_invite_code}
EOF

# 6. Start MCP Sidecars (Docker)
# We need to run this as root or ensure ec2-user group permissions are active (they require re-login)
# Since we are in cloud-init (root), we can run docker directly.
cd docker/mcp
# Pass env var explicitly just in case
TAVILY_API_KEY=${tavily_api_key} /usr/local/bin/docker-compose up -d --build
cd ../..

# 7. Setup Backend (Python)
python3.11 -m venv venv
source venv/bin/activate
pip install -r src/backend/requirements.txt

# 8. Setup SSL directory for Cloudflare Origin Certificate
# The certificate files must be deployed separately (not in user_data for security)
mkdir -p /etc/ssl/cloudflare
chmod 755 /etc/ssl/cloudflare
# Placeholder files - will be replaced with actual certs
touch /etc/ssl/cloudflare/cert.pem /etc/ssl/cloudflare/key.pem
chmod 644 /etc/ssl/cloudflare/cert.pem
chmod 600 /etc/ssl/cloudflare/key.pem
chown -R ec2-user:ec2-user /etc/ssl/cloudflare

# 9. Setup Systemd Service for FastAPI with HTTPS
cat <<SERVICE > /etc/systemd/system/chat-juicer.service
[Unit]
Description=Chat Juicer Backend
After=network.target docker.service

[Service]
User=ec2-user
Group=ec2-user
WorkingDirectory=/opt/chat-juicer/src/backend
Environment="PATH=/opt/chat-juicer/venv/bin:/usr/local/bin:/usr/bin"
EnvironmentFile=/opt/chat-juicer/src/backend/.env
# Allow binding to privileged port 443 without root
AmbientCapabilities=CAP_NET_BIND_SERVICE
ExecStart=/opt/chat-juicer/venv/bin/uvicorn api.main:app --host 0.0.0.0 --port 443 --ssl-keyfile=/etc/ssl/cloudflare/key.pem --ssl-certfile=/etc/ssl/cloudflare/cert.pem
Restart=always

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now chat-juicer
