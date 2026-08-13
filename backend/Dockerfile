FROM python:3.11-slim

WORKDIR /app

# System dependencies for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install. Build from the repo root:
# docker build -f backend/Dockerfile -t halosense-backend .
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/app/ ./app/

# Copy data (analyses.json, laps, clips)
COPY data/ ./data/

# HuggingFace Spaces runs on port 7860
EXPOSE 7860

# Run the app
# MOCK_ML=0 is set as a Space secret, not here
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
