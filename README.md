# DevPulse - AI-Powered DevOps Observability Dashboard

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

We provide an automated setup script to set up a fresh **Ubuntu 22.04 LTS (t2.micro)** EC2 instance:

1. Clone the repository onto the EC2 instance or copy [ec2_setup.sh](file:///c:/Users/rajiv/OneDrive/Desktop/Projects/Main%20Projects/DevPulse/ec2_setup.sh) to the host.
2. Run the script as root, passing your domain name and Let's Encrypt notifications email:
   ```bash
   sudo chmod +x ec2_setup.sh
   sudo ./ec2_setup.sh devpulse.yourdomain.com admin@yourdomain.com
   ```
3. Populate the generated environmental config file at `/home/ubuntu/DevPulse/.env`.
4. Start the systemd service managing the Docker container stack:
   ```bash
   sudo systemctl start devpulse.service
   ```

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
