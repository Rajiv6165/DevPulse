# DevPulse - AI-Powered DevOps Observability Dashboard

[![DevPulse CI/CD Pipeline](https://github.com/Rajiv6165/DevPulse/actions/workflows/deploy.yml/badge.svg)](https://github.com/Rajiv6165/DevPulse/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Deployed on AWS](https://img.shields.io/badge/Deployed%20on-AWS%20EC2-orange.svg?logo=amazon-aws)](https://aws.amazon.com/)

DevPulse is an AI-powered real-time DevOps observability platform designed to monitor service health, ingest system metrics, track latencies, and auto-detect anomalies using machine learning.

---

## Tech Stack

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=FastAPI&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/github%20actions-%232671E5.svg?style=for-the-badge&logo=githubactions&logoColor=white)
![AWS](https://img.shields.io/badge/AWS-%23FF9900.svg?style=for-the-badge&logo=amazon-aws&logoColor=white)

---

## System Architecture

```
+-----------------------------------------------------------------------------------------+
|                                  DEVPULSE DATAFLOW MAP                                  |
+-----------------------------------------------------------------------------------------+
|                                                                                         |
|   +--------------------+           Batch Telemetry       +--------------------------+   |
|   |    Python App      | ------------------------------> |  FastAPI Ingest Service  |   |
|   |  (DevPulse SDK)    |             (HTTP POST)         |       (Port 8000)        |   |
|   +--------------------+                                 +--------------------------+   |
|                                                                        |                |
|                                                       +----------------+----------------+
|                                                       |                                 |
|                                                       v                                 v
|                                            +---------------------+           +--------------------+
|                                            | Supabase PostgreSQL |           |    Upstash Redis   |
|                                            |  (Metrics/Alerts)   |           |  (Metrics Stream)  |
|                                            +---------------------+           +--------------------+
|                                                       ^                                 |
|                                                       |                                 v
|                                                       |                      +--------------------+
|                                                       |                      |   Anomaly Stream   |
|                                                       |                      |    Worker Loop     |
|                                                       |                      +--------------------+
|                                                       |                                 |
|                                                       +--- Writes Anomaly/Alerts -------+
|                                                                                         |
|                                                                                         |
|                                                                                         v
|   +--------------------+           WebSocket Conn        +--------------------------+   |
|   |   React Frontend   | <-----------------------------> |  FastAPI WebSockets API  |   |
|   |  (Zustand / Re)    |            (Port 80/443)        |       (Port 8000)        |   |
|   +--------------------+                                 +--------------------------+   |
|                                                                                         |
+-----------------------------------------------------------------------------------------+
```

---

## Architecture Decisions

### 1. Redis Streams over a Simple Queue
We chose Redis Streams because it supports persistent log structures, multiple independent consumer groups, and replayable message queues. This allows DevPulse to fan out raw metrics to the real-time anomaly engine, storage archivers, and alert dispatchers concurrently without data loss or pipeline blocking.

### 2. Ensemble Anomaly Detection over a Single Algorithm
Observability data is highly dynamic, containing linear trends, sudden spikes, and seasonal cycles. An ensemble combining Rolling Z-Scores (for spikes), Isolation Forests (for non-linear outliers), and Seasonal EMA (for time-of-day variations) provides superior precision, reduces alert fatigue, and adapts to changing workloads.

### 3. Supabase over Self-Hosted Postgres
To minimize operational overhead while maintaining a reliable relational model for complex timelines, we opted for Supabase. It offers managed PostgreSQL, built-in connection pooling via PgBouncer to handle microservice scales, and automated backups, allowing us to focus entirely on analytics.

---

## External Services Setup

### 1. Supabase Setup
DevPulse uses PostgreSQL hosted on Supabase for historical metrics storage, alerts logs, and user account credentials.
1. Create a project at [Supabase](https://supabase.com).
2. Go to **Project Settings** > **Database** to find your connection string (`SUPABASE_DB_URL`).
3. Go to **Settings** > **API** to obtain the API URL (`SUPABASE_URL`) and the service/anon key (`SUPABASE_KEY`).
4. Execute the database schema SQL scripts inside the Supabase SQL editor to create the `users`, `services`, `metrics`, `anomalies`, and `alerts` tables.

### 2. Upstash Redis Setup
Upstash Redis powers the real-time metrics streaming queues (via Redis Streams) and rolling windows for anomaly detection calculations.
1. Create a serverless Redis database at [Upstash](https://upstash.com).
2. Note the REST Endpoint URL (`UPSTASH_REDIS_REST_URL`) and the REST Token (`UPSTASH_REDIS_REST_TOKEN`).

### 3. AWS S3 Setup (Optional)
S3 is used for long-term historical metrics archiving.
1. Create an S3 Bucket in your AWS Account.
2. Create an IAM User with `PutObject` and `GetObject` permissions on the bucket.
3. Obtain the access key (`AWS_ACCESS_KEY_ID`), secret key (`AWS_SECRET_ACCESS_KEY`), and S3 bucket name (`AWS_S3_BUCKET_NAME`).

---

## Local Development Setup

### 1. Backend Setup
1. Clone the repository and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Copy the `.env.example` file to `.env` and fill in all variables:
   ```bash
   cp .env.example .env
   ```
3. Create a python virtual environment, activate it, and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate
   pip install -r requirements.txt
   ```
4. Launch the development server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### 2. Frontend Setup
1. Navigate to the frontend folder:
   ```bash
   cd ../frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Run the Vite development server:
   ```bash
   npm run dev
   ```
4. Access the dashboard UI locally at `http://localhost:3000`.

---

## Production Deployment (AWS EC2)

We provide an automated setup script to set up and configure a fresh **Ubuntu 22.04 LTS** EC2 instance:

1. Copy the idempotent [ec2_setup.sh](file:///c:/Users/rajiv/OneDrive/Desktop/Projects/Main%20Projects/DevPulse/ec2_setup.sh) setup script to your EC2 instance.
2. Execute the script as root, passing your custom domain name and email address for Certbot registration:
   ```bash
   sudo chmod +x ec2_setup.sh
   sudo ./ec2_setup.sh devpulse.yourdomain.com admin@yourdomain.com
   ```
3. Populate the environment configuration file created at `/home/ubuntu/DevPulse/.env` (re-runs will safely preserve your existing `.env`).
4. Start the systemd service managing the container stack:
   ```bash
   sudo systemctl start devpulse.service
   ```
5. Ensure your domain's DNS is pointing at the EC2 public IP. Nginx is configured as a reverse proxy forwarding requests to the Docker containers (frontend on port 8080 and backend on port 8000), complete with Let's Encrypt SSL and auto-renewal checks.

### CI/CD Deployment with Rollback Safety
Every push to the `main` branch triggers the GitHub Actions workflow defined in `.github/workflows/deploy.yml`. 
- **Rollback Safety**: During the deployment, the workflow tags the currently running docker image as `backup`, pulls the latest code, and runs a startup loop for the backend container. If the backend fails its `HEALTHCHECK` within 30 seconds, it automatically reverts back to the backup image and restarts the container, failing the GitHub action pipeline loudly.

### Required GitHub Repository Secrets
For the CI/CD pipeline to work, configure the following secrets in GitHub Repository Settings under **Settings > Secrets and variables > Actions**:
- `EC2_HOST`: Public IP or domain name of the EC2 deployment server.
- `EC2_USER`: SSH username (typically `ubuntu`).
- `EC2_SSH_KEY`: Private SSH Key used to log into the host.
- `VERCEL_TOKEN`: Vercel personal access token for frontend deployment.
- `VERCEL_PROJECT_ID`: Vercel project ID for frontend deployment.

---

## Python SDK Integration

Applications push metrics to DevPulse using the Python SDK package.

### Installation
```bash
pip install ./devpulse-sdk
```

### Usage
```python
from devpulse import DevPulseClient

# Initialize the client (automatically registers as default)
dp = DevPulseClient(api_key="your-service-api-key", service_id="your-service-uuid")

# Manual pushes
dp.push_cpu(72.5)
dp.push_response_time(143.8)

# Decorator to track function metrics
@dp.track_function
def process_checkout(order_id):
    # business logic
    pass
```

---

## Dashboard Interface

### Metrics Charts & Live Log Terminal
*Placeholder for active dashboard dashboard mockup showing real-time area charts, rolling anomaly scores, and system warnings.*

### Anomalies Feed
*Placeholder for anomaly alerts list indicating severities (LOW, MEDIUM, CRITICAL) and real-time resolve triggers.*
