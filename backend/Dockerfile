FROM python:3.12-slim

WORKDIR /app

# Install Python dependencies first for layer caching
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy shared package and backend code
COPY shared/ /app/shared/
COPY backend/ /app/backend/

# Ensure the data directory exists for the SQLite volume mount
RUN mkdir -p /app/backend/data

EXPOSE 8443

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8443"]
