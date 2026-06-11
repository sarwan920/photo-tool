# --- Build Stage for React Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Production Stage for Python FastAPI Backend ---
FROM python:3.11-slim

# Install system dependencies required for OpenCV, curl, and image operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy python requirements and install
COPY server/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy bundled rembg model (u2netp — matches server/main.py default)
ENV U2NET_HOME=/app/server/models

# Copy built static files from frontend stage
COPY --from=frontend-builder /app/dist ./dist

# Copy FastAPI backend code
COPY server/ ./server

# Set environment variables
ENV PYTHONUNBUFFERED=1

# Expose production port
EXPOSE 8000

# Start the uvicorn production server
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]