#!/usr/bin/env bash

# Exit immediately if a command exits with a non-zero status
set -e

# Help / Usage Guide
if [ "$#" -ne 2 ]; then
    echo "Usage: sudo ./ec2_setup.sh <domain_name> <email_address>"
    echo "Example: sudo ./ec2_setup.sh devpulse.example.com admin@example.com"
    exit 1
fi

DOMAIN=$1
EMAIL=$2
USER_HOME="/home/ubuntu"
PROJECT_DIR="${USER_HOME}/DevPulse"

echo "======================================================================"
echo "STARTING DEVPULSE EC2 ENVIRONMENT SETUP ON UBUNTU 22.04"
echo "======================================================================"

# 1. Update and upgrade system packages
echo "[Step 1] Updating system packages..."
apt-get update -y
apt-get upgrade -y

# Check if packages are already installed to avoid unnecessary reinstallations
PACKAGES_TO_INSTALL=()
for pkg in curl git gnupg ca-certificates lsb-release certbot python3-certbot-nginx ufw; do
    if ! dpkg -s "$pkg" >/dev/null 2>&1; then
        PACKAGES_TO_INSTALL+=("$pkg")
    fi
done

if ! command -v nginx >/dev/null 2>&1; then
    PACKAGES_TO_INSTALL+=("nginx")
fi

if [ ${#PACKAGES_TO_INSTALL[@]} -ne 0 ]; then
    echo "Installing missing system packages: ${PACKAGES_TO_INSTALL[*]}"
    apt-get install -y "${PACKAGES_TO_INSTALL[@]}"
else
    echo "All core system packages are already installed."
fi

# 2. Configure Firewall (UFW)
echo "[Step 2] Configuring Firewall (UFW)..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# 3. Install Docker Engine and Docker Compose Plugin
echo "[Step 3] Installing Docker & Docker Compose..."
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
    echo "Installing Docker components..."
    mkdir -p /etc/apt/keyrings
    if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    fi

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    
    # Ensure docker service starts on boot
    systemctl enable docker
    systemctl start docker
    
    # Add ubuntu user to docker group
    usermod -aG docker ubuntu || true
else
    echo "Docker and Docker Compose plugin are already installed."
fi

# 4. Clone / Prepare Repository Directory
echo "[Step 4] Setting up repository..."
if [ ! -d "$PROJECT_DIR" ]; then
    echo "Cloning DevPulse repository..."
    git clone https://github.com/Rajiv6165/DevPulse.git "$PROJECT_DIR"
    chown -R ubuntu:ubuntu "$PROJECT_DIR"
else
    echo "Repository already exists at $PROJECT_DIR, pulling latest changes..."
    cd "$PROJECT_DIR"
    git pull origin main || echo "Warning: Failed to pull latest changes from main branch."
    chown -R ubuntu:ubuntu "$PROJECT_DIR"
fi

# 5. Populate Environmental Variables (.env)
echo "[Step 5] Checking and preparing environment variables (.env)..."
ENV_FILE="${PROJECT_DIR}/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "Creating environment template file."
    cat <<EOT > "$ENV_FILE"
# Supabase Configuration
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_KEY=your-supabase-anon-key
SUPABASE_DB_URL=postgresql://postgres:password@db.supabase.co:5432/postgres

# Upstash Redis Configuration
UPSTASH_REDIS_REST_URL=https://your-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Security Configuration
JWT_SECRET_KEY=$(openssl rand -hex 32)
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Slack Integrations (Optional)
SLACK_WEBHOOK_URL=

# Resend Email Integrations (Optional)
RESEND_API_KEY=
RESEND_SENDER_EMAIL=alerts@yourdomain.com

# AWS S3 Configurations (Optional)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
AWS_S3_BUCKET_NAME=
EOT
    chown ubuntu:ubuntu "$ENV_FILE"
    echo "Template .env created at ${ENV_FILE}. Please edit it before starting services!"
else
    echo ".env file already exists. Skipping recreation to preserve existing secrets."
fi

# 6. Configure Nginx Reverse Proxy
echo "[Step 6] Setting up Nginx Reverse Proxy for domain ${DOMAIN}..."
NGINX_CONF="/etc/nginx/sites-available/devpulse"

# Check if SSL is already configured in the existing Nginx conf to ensure idempotency
if grep -q "listen 443 ssl" "$NGINX_CONF" 2>/dev/null; then
    echo "Nginx configuration at $NGINX_CONF already has SSL configured. Skipping rewrite."
else
    # Write custom Nginx config, replacing server names dynamically
    cat <<EOT > "$NGINX_CONF"
# Gzip Compression Configuration
gzip on;
gzip_disable "msie6";
gzip_vary on;
gzip_proxied any;
gzip_comp_level 6;
gzip_buffers 16 8k;
gzip_http_version 1.1;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;

# Security Headers Configuration
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer-when-downgrade" always;
add_header Content-Security-Policy "default-src 'self' http: https: ws: wss: data: blob: 'unsafe-inline' 'unsafe-eval';" always;

server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:8000/ws/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
EOT

    # Link configuration file and disable default server
    ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/devpulse
    rm -f /etc/nginx/sites-enabled/default

    # Test and restart Nginx
    nginx -t
    systemctl restart nginx
fi

# 7. Obtain Let's Encrypt SSL Certificate via Certbot
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    echo "SSL Certificate for $DOMAIN already exists. Skipping Certbot registration."
else
    echo "[Step 7] Setting up SSL with Let's Encrypt / Certbot..."
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect
    
    # Test automatic SSL renewal
    certbot renew --dry-run
fi

# 8. Create systemd Service for Docker Compose Application
echo "[Step 8] Setting up systemd Service for Auto-start on boot..."
SYSTEMD_SERVICE="/etc/systemd/system/devpulse.service"

cat <<EOT > "$SYSTEMD_SERVICE"
[Unit]
Description=DevPulse Observe-AI Application Services (Docker Compose)
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${PROJECT_DIR}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
EOT

# Reload systemd configuration and enable service
systemctl daemon-reload
systemctl enable devpulse.service

echo "======================================================================"
echo "DEVPULSE EC2 DEPLOYMENT SETUP COMPLETED SUCCESSFULLY!"
echo "======================================================================"
echo "Next Steps:"
echo "1. Run: nano ${ENV_FILE}"
echo "   Populate all missing production database and client keys."
echo "2. Run: sudo systemctl start devpulse.service"
echo "======================================================================"

