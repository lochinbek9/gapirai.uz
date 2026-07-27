#!/bin/bash

# Production Environment Configuration for AI Dubber Server
# This helper script provides the necessary .env file content for deployment

cat > /opt/xadichai/.env << 'ENVEOF'
# App Configuration
APP_NAME="AI Dubber"
DEBUG=False
ENV=production

# Database (PostgreSQL)
DATABASE_URL="postgresql://dubber:dubber123@localhost:5432/dubber_db"
ASYNC_DATABASE_URL="postgresql+asyncpg://dubber:dubber123@localhost:5432/dubber_db"

# Redis / Celery
REDIS_URL="redis://localhost:6379/0"
CELERY_BROKER_URL="redis://localhost:6379/0"
CELERY_RESULT_BACKEND="redis://localhost:6379/0"
CELERY_TASK_ALWAYS_EAGER=False

# OpenAI Configuration
OPENAI_API_KEY="your-openai-api-key-here"
OPENAI_MODEL="gpt-4o-mini"
OPENAI_TRANSCRIPTION_MODEL="whisper-1"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"

# Azure TTS Configuration
AZURE_SPEECH_KEY="your-azure-key-here"
AZURE_SPEECH_REGION="eastus"
AZURE_VOICE_NAME="uz-UZ-SardorNeural"
AZURE_PITCH="default"

# AWS S3 (Optional - for video storage)
AWS_ACCESS_KEY_ID="your-aws-access-key-here"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key-here"
AWS_BUCKET_NAME="ai-dubber-videos-production"
AWS_REGION="us-east-1"
AWS_ENDPOINT_URL="https://s3.amazonaws.com"
AWS_S3_USE_SSL=True

# Google Cloud Storage (Alternative - uncomment if needed)
# GCS_PROJECT_ID="your-project-id"
# GCS_BUCKET_NAME="ai-dubber-videos-production"
# GCS_REGION="us"
# GCS_PRIVATE_KEY_FILE="/path/to/service-account-key.json"

# Payment Integration (Click Payment)
CLICK_MERCHANT_ID="your_merchant_id_here"
CLICK_SERVICE_ID="your_service_id_here"
CLICK_SECRET_KEY="your_secret_key_here"
CLICK_SECRET_ID="your_secret_id_here"

# Frontend URL (Used for payment redirects and CORS)
FRONTEND_URL="https://xadichai.uz"
BACKEND_URL="https://xadichai.uz"

# Email Configuration (Optional - for notifications)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USERNAME="your-email@example.com"
SMTP_PASSWORD="your-smtp-password"
SMTP_FROM="noreply@xadichai.uz"
SMTP_USE_TLS=True

# Optional Features
ENABLE_EMAIL_NOTIFICATIONS=True
ENABLE_SMS_NOTIFICATIONS=False
MAX_VIDEO_SIZE_MB=100
MAX_CONCURRENT_TASKS=5
MAX_VIDEO_DURATION_MINUTES=60
ENVEOF

echo "✓ Production .env file created at /opt/xadichai/.env"
echo ""
echo "IMPORTANT: Update the following values in the .env file:"
echo "  - OPENAI_API_KEY"
echo "  - AZURE_SPEECH_KEY"
echo "  - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (if using S3)"
echo "  - CLICK_MERCHANT_ID, CLICK_SERVICE_ID, CLICK_SECRET_KEY"
echo "  - SMTP credentials (if email notifications enabled)"
echo ""
echo "After updating, restart services:"
echo "  sudo supervisorctl restart ai-dubber-api ai-dubber-worker"
