# Deployment Guide - Minesweeper Key System

This guide provides instructions for deploying the Minesweeper Key System to Google Cloud Platform (GCP).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Option 1: Google App Engine](#option-1-google-app-engine-recommended-for-simplicity)
- [Option 2: Google Cloud Run](#option-2-google-cloud-run-recommended-for-flexibility)
- [Option 3: Compute Engine](#option-3-compute-engine-vm)
- [Environment Variables](#environment-variables)
- [Important Notes](#important-notes)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:

1. **Google Cloud Account**: Create one at [cloud.google.com](https://cloud.google.com)
2. **Google Cloud Project**: Create a new project in the [GCP Console](https://console.cloud.google.com)
3. **gcloud CLI**: Install from [cloud.google.com/sdk](https://cloud.google.com/sdk/docs/install)
4. **Billing Enabled**: Enable billing for your project

### Initial Setup

```bash
# Install gcloud CLI (if not already installed)
# Follow instructions at: https://cloud.google.com/sdk/docs/install

# Login to Google Cloud
gcloud auth login

# Set your project
gcloud config set project YOUR_PROJECT_ID

# Enable required APIs
gcloud services enable appengine.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

---

## Option 1: Google App Engine (Recommended for simplicity)

App Engine is the simplest deployment option with automatic scaling and minimal configuration.

### Steps

1. **Initialize App Engine** (first time only):
   ```bash
   gcloud app create --region=asia-southeast1
   ```

2. **Deploy the application**:
   ```bash
   gcloud app deploy
   ```

3. **Access your application**:
   ```bash
   gcloud app browse
   ```
   Or visit: `https://YOUR_PROJECT_ID.appspot.com`

### Configuration

The deployment uses `app.yaml` with the following settings:
- **Runtime**: Python 3.9
- **Instance Class**: F1 (free tier eligible)
- **Scaling**: 0-2 instances with 65% CPU target

### Costs

- F1 instances: ~$0.05/hour when running
- Free tier: 28 instance hours/day

---

## Option 2: Google Cloud Run (Recommended for flexibility)

Cloud Run provides containerized deployment with pay-per-use pricing.

### Quick Deploy

```bash
# Build and deploy in one command
gcloud run deploy minesweeper-key \
  --source . \
  --region asia-southeast1 \
  --platform managed \
  --allow-unauthenticated
```

### Manual Deploy (with more control)

1. **Build the container image**:
   ```bash
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/minesweeper-key
   ```

2. **Deploy to Cloud Run**:
   ```bash
   gcloud run deploy minesweeper-key \
     --image gcr.io/YOUR_PROJECT_ID/minesweeper-key \
     --region asia-southeast1 \
     --platform managed \
     --allow-unauthenticated \
     --memory 256Mi \
     --cpu 1 \
     --min-instances 0 \
     --max-instances 2
   ```

3. **Get the service URL**:
   ```bash
   gcloud run services describe minesweeper-key --region asia-southeast1 --format='value(status.url)'
   ```

### Using Cloud Build (CI/CD)

For automated deployments, use the included `cloudbuild.yaml`:

```bash
gcloud builds submit --config cloudbuild.yaml
```

### Costs

- Pay only for requests processed
- Free tier: 2 million requests/month
- ~$0.00002400 per vCPU-second

---

## Option 3: Compute Engine (VM)

For full control over the server environment.

### Steps

1. **Create a VM instance**:
   ```bash
   gcloud compute instances create minesweeper-vm \
     --zone=asia-southeast1-a \
     --machine-type=e2-micro \
     --image-family=debian-11 \
     --image-project=debian-cloud \
     --tags=http-server
   ```

2. **Create firewall rule** (if not exists):
   ```bash
   gcloud compute firewall-rules create allow-http \
     --allow tcp:80,tcp:8080 \
     --target-tags http-server
   ```

3. **SSH into the VM**:
   ```bash
   gcloud compute ssh minesweeper-vm --zone=asia-southeast1-a
   ```

4. **Install dependencies on the VM**:
   ```bash
   sudo apt update
   sudo apt install -y python3 python3-pip git
   ```

5. **Clone/upload your project**:
   ```bash
   # Option A: Clone from git
   git clone YOUR_REPO_URL
   cd minesweeper-key

   # Option B: Upload files using gcloud
   # (run from local machine)
   gcloud compute scp --recurse ./* minesweeper-vm:~/minesweeper-key --zone=asia-southeast1-a
   ```

6. **Install Python dependencies**:
   ```bash
   cd minesweeper-key
   pip3 install -r requirements.txt
   ```

7. **Run with gunicorn**:
   ```bash
   # Run in foreground
   gunicorn --bind 0.0.0.0:8080 --workers 2 --threads 4 app:app

   # Or run in background with nohup
   nohup gunicorn --bind 0.0.0.0:8080 --workers 2 --threads 4 app:app &
   ```

8. **Set up systemd service** (recommended for production):
   ```bash
   sudo nano /etc/systemd/system/minesweeper.service
   ```

   Add the following content:
   ```ini
   [Unit]
   Description=Minesweeper Key System
   After=network.target

   [Service]
   User=YOUR_USERNAME
   WorkingDirectory=/home/YOUR_USERNAME/minesweeper-key
   ExecStart=/usr/local/bin/gunicorn --bind 0.0.0.0:8080 --workers 2 --threads 4 app:app
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

   Enable and start the service:
   ```bash
   sudo systemctl enable minesweeper
   sudo systemctl start minesweeper
   ```

### Costs

- e2-micro: ~$6.11/month (free tier eligible for 1 instance)

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `DATABASE_PATH` | SQLite database file path | `minesweeper.db` |
| `FLASK_ENV` | Flask environment | `production` |

### Setting Environment Variables

**App Engine** (in `app.yaml`):
```yaml
env_variables:
  FLASK_ENV: "production"
  DATABASE_PATH: "/tmp/minesweeper.db"
```

**Cloud Run**:
```bash
gcloud run deploy minesweeper-key \
  --set-env-vars="FLASK_ENV=production,DATABASE_PATH=/app/data/minesweeper.db"
```

**Compute Engine**:
```bash
export FLASK_ENV=production
export DATABASE_PATH=/var/data/minesweeper.db
```

---

## Important Notes

### Database Considerations

⚠️ **SQLite Limitations**: SQLite is file-based and not ideal for production deployments with multiple instances:

- **App Engine**: Data may be lost on instance restart
- **Cloud Run**: Each container has its own database (not shared)
- **Compute Engine**: Works well for single-instance deployments

**For production**, consider migrating to:
- **Cloud SQL** (PostgreSQL/MySQL)
- **Firestore** (NoSQL)
- **Cloud Spanner** (Distributed SQL)

### Security Recommendations

1. **Change Admin Password**: Update the admin authentication in production
2. **Enable HTTPS**: All GCP services provide HTTPS by default
3. **Restrict Admin Access**: Consider adding IP restrictions or OAuth
4. **Use Secret Manager**: Store sensitive data in [Secret Manager](https://cloud.google.com/secret-manager)

### Monitoring

Enable monitoring for your deployment:

```bash
# View logs
gcloud app logs tail -s default  # App Engine
gcloud run logs read minesweeper-key  # Cloud Run

# Set up alerts
gcloud alpha monitoring policies create --policy-from-file=alert-policy.yaml
```

---

## Troubleshooting

### Common Issues

**1. "Permission denied" errors**
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

**2. "API not enabled" errors**
```bash
gcloud services enable appengine.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
```

**3. Database not persisting (Cloud Run)**
- Use Cloud SQL or mount a persistent volume
- Or accept that data resets on container restart

**4. Application not starting**
- Check logs: `gcloud app logs tail` or `gcloud run logs read`
- Verify `requirements.txt` includes all dependencies
- Ensure `gunicorn` is installed

**5. 502 Bad Gateway**
- Increase timeout in Cloud Run settings
- Check if the application is binding to the correct port (`$PORT`)

### Getting Help

- [App Engine Documentation](https://cloud.google.com/appengine/docs)
- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [GCP Support](https://cloud.google.com/support)

---

## Quick Reference

| Deployment | Command |
|------------|---------|
| App Engine | `gcloud app deploy` |
| Cloud Run | `gcloud run deploy minesweeper-key --source . --region asia-southeast1 --allow-unauthenticated` |
| View Logs | `gcloud app logs tail` or `gcloud run logs read` |
| Get URL | `gcloud app browse` or `gcloud run services describe minesweeper-key --format='value(status.url)'` |