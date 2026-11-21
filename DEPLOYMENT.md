# CertiFlow Deployment Guide 🚀

This document covers end-to-end deployment for **CertiFlow**—from single-server Docker Compose deployment on AWS EC2 to high-availability enterprise cloud production using managed AWS services (RDS, ElastiCache, S3, CloudFront).

---

## 📑 Table of Contents
1. [Architecture & Deployment Models](#1-architecture--deployment-models)
2. [Server Requirements & Sizing](#2-server-requirements--sizing)
3. [AWS EC2 Deployment (Single Node)](#3-aws-ec2-deployment-single-node)
   - [3.1 Security Group Configuration](#31-security-group-configuration)
   - [3.2 Server Provisioning & Swap Space](#32-server-provisioning--swap-space)
   - [3.3 Docker & Docker Compose Setup](#33-docker--docker-compose-setup)
   - [3.4 Deploying CertiFlow](#34-deploying-certiflow)
4. [Domain, Nginx & SSL Setup (HTTPS)](#4-domain-nginx--ssl-setup-https)
5. [Enterprise Production Hardening (AWS Managed Services)](#5-enterprise-production-hardening-aws-managed-services)
   - [5.1 PostgreSQL -> AWS RDS](#51-postgresql---aws-rds)
   - [5.2 Redis -> AWS ElastiCache](#52-redis---aws-elasticache)
   - [5.3 MinIO -> Amazon S3](#53-minio---amazon-s3)
6. [Scaling & Concurrency Tuning](#6-scaling--concurrency-tuning)
7. [Backup, Disaster Recovery & Operational Runbooks](#7-backup-disaster-recovery--operational-runbooks)
8. [Monitoring & Health Probes](#8-monitoring--health-probes)

---

## 1. Architecture & Deployment Models

CertiFlow consists of 5 core application services:
1. **`web`**: Nginx serving the compiled React 18 single-page app and acting as the unified gateway on port `8080` (or `80`/`443`).
2. **`api`**: Express application handling REST endpoints, auth, webhooks, and Socket.IO WebSocket connections (port `3000`).
3. **`worker`**: BullMQ background consumers processing certificate PDF generation, WhatsApp deliveries, outbox relay events, and SLA checks.
4. **`mock-whatsapp`**: Simulated WhatsApp Business API provider with realistic failure injection and HMAC delivery callbacks (port `4000`).
5. **Backing Stores**: PostgreSQL 16 (relational data & outbox), Redis 7 (AOF queues & cache), MinIO (S3-compatible PDF storage on `9000`/`9001`).

```mermaid
flowchart TD
  Internet([Internet / Clients]) --> Gateway[Host Nginx / Load Balancer :443]
  Gateway -- HTTPS --> Web[certiflow-web :8080]
  Web -- Reverse Proxy --> API[certiflow-api :3000]
  Web -- Reverse Proxy --> MockWA[certiflow-mock-whatsapp :4000]
  
  API --> PG[(PostgreSQL 16)]
  API --> RD[(Redis 7)]
  
  Worker[certiflow-worker] --> PG
  Worker --> RD
  Worker --> S3[(MinIO / AWS S3)]
  Worker -- Send Message --> MockWA
  MockWA -- Signed Webhook --> API
```

---

## 2. Server Requirements & Sizing

| Environment | Instance Type | vCPU / RAM | Storage | Usage |
|---|---|---|---|---|
| **Demo / Staging** | AWS `t3.medium` | 2 vCPU / 4 GB | 30 GB gp3 + 4 GB Swap | Hackathons, evaluations, small pilots |
| **Production (Single-node)** | AWS `t3.large` or `c6i.large` | 2–4 vCPU / 8 GB | 50 GB gp3 + 4 GB Swap | Medium scale (up to 5,000 certs/day) |
| **Production (High-Scale)** | ECS / EKS + Managed RDS | Multi-instance | Distributed | High availability, 50,000+ certs/day |

---

## 3. AWS EC2 Deployment (Single Node)

### 3.1 Security Group Configuration
In the AWS EC2 Console, create a Security Group attached to your instance:

| Type | Protocol | Port | Source | Description |
|---|---|---|---|---|
| **SSH** | TCP | `22` | `My IP` (or VPN CIDR) | Remote administration |
| **HTTP** | TCP | `80` | `0.0.0.0/0` | Public web traffic & ACME challenges |
| **HTTPS** | TCP | `443` | `0.0.0.0/0` | Secure public web traffic |
| *(Optional)* | TCP | `9001` | `My IP` | MinIO web console (keep restricted) |

> 🔒 **Security Notice**: Do **NOT** expose ports `5432` (Postgres), `6379` (Redis), or `3000` (API) publicly. All inter-container communication occurs over Docker's private bridge network.

---

### 3.2 Server Provisioning & Swap Space

SSH into your Ubuntu 24.04 EC2 instance:
```bash
ssh -i /path/to/key.pem ubuntu@<YOUR_EC2_PUBLIC_IP>
```

Update system packages and create a **4 GB swap file** to prevent the Linux Out-Of-Memory (OOM) killer from terminating Docker builds:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git htop net-tools ncdu ca-certificates gnupg lsb-release

# Configure 4GB Swap
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

### 3.3 Docker & Docker Compose Setup

Install the official Docker Engine and Compose v2 plugin:
```bash
# Add Docker GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable Docker for the ubuntu user
sudo usermod -aG docker $USER
newgrp docker

# Configure Docker log rotation (prevents disk space exhaustion)
sudo tee /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "20m",
    "max-file": "3"
  }
}
EOF
sudo systemctl restart docker
```

---

### 3.4 Deploying CertiFlow

1. **Clone the repository**:
   ```bash
   git clone https://github.com/<YOUR_ORGANIZATION_OR_USERNAME>/CertiFlow.git
   cd CertiFlow
   ```

2. **Configure Production Environment**:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Configure the following required production variables:
   ```ini
   NODE_ENV=production
   LOG_LEVEL=info
   
   # Public domain pointing to this server
   PUBLIC_WEB_URL=https://certiflow-demo.duckdns.org
   CORS_ORIGINS=https://certiflow-demo.duckdns.org
   
   # Security: Generate random 32+ char secrets (`openssl rand -hex 32`)
   JWT_SECRET=replace_with_a_secure_random_hex_string_at_least_32_chars
   WHATSAPP_WEBHOOK_SECRET=replace_with_secure_random_webhook_secret_key
   DOWNLOAD_TOKEN_SECRET=replace_with_secure_random_download_secret_key
   
   # Database & Object Storage
   DATABASE_URL=postgresql://certiflow:YourStrongDbPassword@postgres:5432/certiflow
   S3_ACCESS_KEY=certiflow
   S3_SECRET_KEY=YourStrongStoragePassword
   
   # Demo personas switcher (set to false for strictly authenticated production)
   DEMO_LOGIN_ENABLED=true
   ```

3. **Start the Application**:
   ```bash
   docker compose up --build -d
   ```

4. **Verify container health**:
   ```bash
   docker compose ps
   ```
   All services (`certiflow-api-1`, `certiflow-worker-1`, `certiflow-web-1`, `certiflow-postgres-1`, `certiflow-redis-1`, `certiflow-mock-whatsapp-1`, `certiflow-minio-1`) should report `Up` or `healthy`.

---

## 4. Domain, Nginx & SSL Setup (HTTPS)

To enable SSL/TLS certificates using **Let's Encrypt** with a custom domain or dynamic DNS (e.g. `certiflow-demo.duckdns.org`):

### 4.1 Install Nginx & Certbot on the EC2 Host
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 4.2 Obtain SSL Certificate
Make sure your domain's DNS `A` record points to your EC2 Public IP, then run:
```bash
sudo certbot certonly --standalone -d certiflow-demo.duckdns.org
```

### 4.3 Configure Host Nginx Reverse Proxy
Remove the default site and configure Nginx:
```bash
sudo rm -f /etc/nginx/sites-enabled/default

sudo tee /etc/nginx/sites-available/certiflow >/dev/null <<'EOF'
# Redirect all HTTP (80) to HTTPS (443)
server {
    listen 80;
    listen [::]:80;
    server_name certiflow-demo.duckdns.org;
    return 301 https://$host$request_uri;
}

# HTTPS Proxy to CertiFlow Web Container (:8080)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name certiflow-demo.duckdns.org;

    ssl_certificate /etc/letsencrypt/live/certiflow-demo.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/certiflow-demo.duckdns.org/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;

        # WebSocket support (Socket.IO realtime pushes)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 3600s;
    }
}
EOF

sudo ln -sfn /etc/nginx/sites-available/certiflow /etc/nginx/sites-enabled/certiflow
sudo nginx -t && sudo systemctl reload nginx
```

---

## 5. Enterprise Production Hardening (AWS Managed Services)

For mission-critical deployments serving millions of credentials, transition from containerized state stores to managed AWS cloud infrastructure:

### 5.1 PostgreSQL -> AWS RDS
1. Launch an **Amazon RDS for PostgreSQL 16** instance (Multi-AZ for high availability).
2. Apply database migrations:
   ```bash
   DATABASE_URL="postgresql://user:pass@your-rds-cluster.rds.amazonaws.com:5432/certiflow" npx prisma migrate deploy
   ```
3. Update `DATABASE_URL` in `.env`.
4. Comment out or remove the `postgres` service from `docker-compose.yml`.

### 5.2 Redis -> AWS ElastiCache
1. Provision an **AWS ElastiCache for Redis 7** cluster with in-transit encryption enabled.
2. Update `REDIS_URL` in `.env`:
   ```ini
   REDIS_URL=rediss://default:YourRedisAuthToken@your-elasticache.cache.amazonaws.com:6379/0
   ```
3. Comment out the `redis` service in `docker-compose.yml`.

### 5.3 MinIO -> Amazon S3
1. Create a private S3 bucket (e.g. `psm-certificates-prod`).
2. Attach an IAM role to your EC2 instance with `s3:PutObject`, `s3:GetObject`, and `s3:DeleteObject` permissions on `arn:aws:s3:::psm-certificates-prod/*`.
3. Update `.env`:
   ```ini
   S3_ENDPOINT=https://s3.ap-south-1.amazonaws.com
   S3_REGION=ap-south-1
   S3_BUCKET=psm-certificates-prod
   ```
4. Comment out the `minio` service in `docker-compose.yml`.

---

## 6. Scaling & Concurrency Tuning

CertiFlow's architecture is stateless in the API tier and horizontally scalable in the worker tier:

### 6.1 Scaling API and Worker Containers
Scale replicas horizontally with Docker Compose:
```bash
docker compose up -d --scale api=2 --scale worker=3
```
- **API Clustering**: Scaled API replicas share WebSocket state automatically via the Redis Socket.IO adapter.
- **Worker Scaling**: Multiple workers consume jobs from BullMQ without duplicate execution due to deterministic job IDs.

### 6.2 Worker Concurrency Settings
Tune concurrency in `.env` based on server CPU cores:
```ini
# Concurrent PDF generation tasks (CPU-bound)
CERT_CONCURRENCY=8

# Concurrent WhatsApp message dispatches (I/O-bound)
SEND_CONCURRENCY=20
```

---

## 7. Backup, Disaster Recovery & Operational Runbooks

### 7.1 Automated PostgreSQL Backup Script
Create an automated daily database backup to Amazon S3:

`/usr/local/bin/backup-certiflow.sh`:
```bash
#!/bin/bash
set -e
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/certiflow"
mkdir -p "$BACKUP_DIR"

docker compose -f /home/ubuntu/CertiFlow/docker-compose.yml exec -T postgres \
  pg_dump -U certiflow certiflow | gzip > "$BACKUP_DIR/certiflow_$TIMESTAMP.sql.gz"

# Retain only last 7 days locally
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +7 -delete

# (Optional) Push to AWS S3
# aws s3 cp "$BACKUP_DIR/certiflow_$TIMESTAMP.sql.gz" s3://your-backup-bucket/db/
```
Schedule in `crontab -e`:
```cron
0 2 * * * /usr/local/bin/backup-certiflow.sh >> /var/log/certiflow-backup.log 2>&1
```

### 7.2 Database Restore Runbook
To restore from a backup archive:
```bash
gunzip -c /var/backups/certiflow/certiflow_YYYYMMDD_HHMMSS.sql.gz | \
  docker compose exec -T postgres psql -U certiflow -d certiflow
```

### 7.3 Dead-Letter Queue (DLQ) Recovery
If carrier outages or bad phone numbers land deliveries in the dead-letter queue:
1. Navigate to `/deliveries` in the web portal as a `STATE` officer (e.g. **Farah Siddiqui**).
2. Filter by the **Dead-Letter Deliveries** table.
3. Review the provider error code (e.g., `Handset unreachable`).
4. Click **Retry** to automatically generate a fresh idempotency key (`dlv-<id>-g<n+1>`) and re-enqueue the job.

### 7.4 Zero-Downtime Application Update Runbook
To roll out new code without downtime:
```bash
cd /home/ubuntu/CertiFlow
git pull origin main

# Rebuild images without stopping running containers
docker compose build

# Recreate containers with rolling updates
docker compose up -d --no-deps api
docker compose up -d --no-deps worker
docker compose up -d --no-deps web
```

---

## 8. Monitoring & Health Probes

| Probe / Metric | URL | Purpose | Expected Status |
|---|---|---|---|
| **Liveness Probe** | `GET /healthz` | Confirms process is running | HTTP `200 OK` `{"status":"ok"}` |
| **Readiness Probe** | `GET /readyz` | Checks Postgres & Redis connectivity | HTTP `200 OK` `{"status":"ready"}` |
| **Prometheus Metrics**| `GET /metrics` | Telemetry for CPU, memory, request latency | Prometheus text format |
| **Queue Visualizer** | `GET /admin/queues` | Live Bull Board dashboard (Requires `STATE` role) | Web Dashboard |

To inspect system resource consumption live:
```bash
docker stats
```
To view aggregated logs with timestamps:
```bash
docker compose logs -f --tail=100 api worker
```
