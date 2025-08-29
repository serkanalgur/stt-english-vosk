# Base image
FROM python:3.10-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libasound2-dev \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies - SPECIFICALLY vosk 0.3.31 for older model format
RUN pip install --no-cache-dir -r requirements.txt

# Create models directory
RUN mkdir -p /app/models/en

# Download and extract ENGLISH model (0.15 version with am/final.mdl)
RUN wget -q https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip -O /app/models/en.zip && \
    unzip -q /app/models/en.zip -d /app/models/temp && \
    # Find the model directory
    MODEL_DIR=$(find /app/models/temp -mindepth 1 -maxdepth 1 -type d | head -1) && \
    echo "Extracting model from: $MODEL_DIR" && \
    # Move contents directly to model directory
    mv "$MODEL_DIR"/* /app/models/en/ && \
    # Verify model structure (older format with am/final.mdl)
    if [ ! -f "/app/models/en/am/final.mdl" ]; then \
    echo "ERROR: Expected am/final.mdl but found:"; \
    ls -la /app/models/en; \
    ls -la /app/models/en/am; \
    exit 1; \
    fi && \
    # Cleanup
    rm -rf /app/models/temp /app/models/en.zip && \
    echo "✅ English model (0.15) installed successfully!"

# Copy application
COPY . .

# Expose port
EXPOSE 5000

# Run the application
CMD ["python", "server.py"]
