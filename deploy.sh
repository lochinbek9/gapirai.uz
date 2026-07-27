#!/bin/bash

# AI Dubber Deployment Script for Ubuntu Server
# This script deploys the frontend, backend, and configures services

set -e

SERVER_HOST="51.21.35.247"
SERVER_USER="ubuntu"
SSH_KEY="~/.ssh/id_ed25519_lodex"
DEPLOY_DIR="/opt/xadichai"

echo "=== AI Dubber Deployment Script ==="
echo "Target: ${SERVER_HOST}"
echo "Deploy Directory: ${DEPLOY_DIR}"
echo ""

# Read deployment inputs
read -p "Enter SSH private key path (default: ${SSH_KEY}): " SSH_KEY_INPUT
SSH_KEY=${SSH_KEY_INPUT:-$SSH_KEY}

read -sp "Enter SSH key password (if any): " SSH_PASS
echo ""

read -p "Enter OPENAI_API_KEY: " OPENAI_API_KEY
read -p "Enter AZURE_SPEECH_KEY: " AZURE_SPEECH_KEY
read -p "Enter CLICK_MERCHANT_ID (optional): " CLICK_MERCHANT_ID
read -p "Enter CLICK_SERVICE_ID (optional): " CLICK_SERVICE_ID
read -sp "Enter CLICK_SECRET_KEY (optional): " CLICK_SECRET_KEY
echo ""

# Deploy function
deploy() {
    echo "=== Starting Deployment ==="
    echo ""

    Deploy_command << DEPLOY_SCRIPT
#!/bin/bash
set -e

echo "1. Create deployment directories..."
sudo mkdir -p ${DEPLOY_DIR}
sudo mkdir -p /var/www/xadichai.uz/public
sudo chown -R ubuntu:ubuntu ${DEPLOY_DIR} /var/www/xadichai.uz
sudo chmod -R 755 ${DEPLOY_DIR} /var/www/xadichai.uz

echo ""
echo "2. Setup environment files..."
cd ${DEPLOY_DIR}

# Main .env file
cat > .env << ENVEOF
APP_NAME="AI Dubber"
DEBUG=False

DATABASE_URL="postgresql://dubber:dubber123@localhost:5432/dubber_db"
ASYNC_DATABASE_URL="postgresql+asyncpg://dubber:dubber123@localhost:5432/dubber_db"

REDIS_URL="redis://localhost:6379/0"
CELERY_BROKER_URL="redis://localhost:6379/0"
CELERY_RESULT_BACKEND="redis://localhost:6379/0"

OPENAI_API_KEY="${OPENAI_API_KEY}"
OPENAI_MODEL="gpt-4o"
OPENAI_TRANSCRIPTION_MODEL="whisper-1"

AZURE_SPEECH_KEY="${AZURE_SPEECH_KEY}"
AZURE_SPEECH_REGION="eastus"
AZURE_VOICE_NAME="uz-UZ-SardorNeural"

CLICK_MERCHANT_ID="${CLICK_MERCHANT_ID}"
CLICK_SERVICE_ID="${CLICK_SERVICE_ID}"
CLICK_SECRET_KEY="${CLICK_SECRET_KEY}"

FRONTEND_URL="https://xadichai.uz"
ENVEOF

echo ""
echo "3. Setup Supervisor configuration..."

# Create supervisor configuration
sudo tee /etc/supervisor/conf.d/xadichai.conf > /dev/null << SUPEROEEOF
[program:ai-dubber-api]
command=/opt/xadichai/.venv/bin/python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
directory=/opt/xadichai
user=ubuntu
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/ai-dubber/api.log
environment=PYTHONPATH="/opt/xadichai"
stopwaitsecs=10

[program:ai-dubber-worker]
command=/opt/xadichai/.venv/bin/celery -A backend.workers.celery_app worker -l info -Q video_processing -c 2
directory=/opt/xadichai
user=ubuntu
autostart=true
autorestart=true
redirect_stderr=true
stdout_logfile=/var/log/ai-dubber/worker.log
environment=PYTHONPATH="/opt/xadichai"
stopwaitsecs=10
SUPEROEEOF

echo ""
echo "4. Setup Flask or Uvicorn for frontend..."

# If using Flask for frontend
if command -v flask &> /dev/null; then
    echo "Using Flask for frontend"
    cat > /opt/xadichai/requirements.txt << FLASKREQUIREMENTS
fastapi==0.115.6
uvicorn[standard]==0.32.1
Python-multipart==0.0.20
python-dotenv==1.0.1
pydantic==2.10.4
aiofiles==24.1.0
SQLAlchemy==2.0.36
asyncpg==0.30.0
celery==5.4.0
redis==5.2.1
EOF
elif known /opt/xadichai/frontend/.next; then
    # For Next.js frontend
    echo "Setting up Next.js frontend deployment"
    sudo ln -sf ${DEPLOY_DIR}/frontend/.next/standalone /opt/xadichai/frontend
    echo "Install Nginx for static serving"
    sudo apt-get install -y nginx
    cd ${DEPLOY_DIR}/frontend
    npm install
    npm run build
fi

echo ""
echo "5. Install system dependencies..."
sudo apt-get update -y
sudo apt-get install -y python3-pip postgresql redis-server certbot python3-certbot-nginx supervisor nodejs npm

echo ""
echo "6. Restart supervisor..."
# Use system supervisorctl
sudo systemctl restart supervisor
sudo supervisorctl reread
sudo supervisorctl update

echo ""
echo "7. Start services..."
sudo supervisorctl start ai-dubber-api ai-dubber-worker

echo ""
echo "8. Setup SSL with Certbot..."
DOMAIN="xadichai.uz"
if [ ! -d /etc/letsencrypt/live/\${DOMAIN} ]; then
    if [ "$CLICK_MERCHANT_ID" != "" ] && [ "$CLICK_SERVICE_ID" != "" ]; then
        # Has payment config, setup with domains
        sudo certbot certonly --nginx -d ${DOMAIN} --agree-tos --non-interactive -m contact@xadichai.uz
    else
        # No payment config, skip SSL for now
        echo "Skipping SSL setup - add payment config first"
    fi
else
    echo "SSL certificate already exists"
fi

echo ""
echo "9. Setup Nginx..."
sudo tee /etc/nginx/sites-available/xadichai > /dev/null << NGINXCONFIG
server {
    listen 80;
    listen [::]:80;
    server_name xadichai.uz;

    root /var/www/xadichai.uz/public;
    index index.html;

    location / {
        return 301 https://\\$host\\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name xadichai.uz;

    root /var/www/xadichai.uz/public;
    index index.html;

    ssl_certificate /etc/letsencrypt/live/xadichai.uz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/xadichai.uz/privkey.pem;

    location / {
        try_files \\$uri \\$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
    }

    location /graphql {
        proxy_pass http://127.0.0.1:8000/graphql;
        proxy_http_version 1.1;
        proxy_set_header Host \\$host;
        proxy_set_header X-Real-IP \\$remote_addr;
    }
}
NGINXCONFIG

sudo ln -sf /etc/nginx/sites-available/xadichai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

echo ""
echo "=== Deployment Complete ==="
DEPLOY_SCRIPT

    if [ $? -eq 0 ]; then
        echo "✓ Deployment successful!"
    else
        echo "✗ Deployment failed"
        exit 1
    fi
}

deploy
