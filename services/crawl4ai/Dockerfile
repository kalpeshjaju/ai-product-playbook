# Crawl4AI Web Scraping Service
#
# WHY: Open-source replacement for Firecrawl. Outputs clean markdown from any URL.
# HOW: Python 3.11 + Crawl4AI (headless Chromium via Playwright) + FastAPI.
#
# BUILD: docker build -t crawl4ai services/crawl4ai/
# RUN:   docker run -p 8000:8000 crawl4ai

FROM python:3.11-slim

WORKDIR /app

# System deps for Playwright/Chromium
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        wget gnupg ca-certificates \
        libnss3 libatk-bridge2.0-0 libdrm2 libxcomposite1 \
        libxdamage1 libxrandr2 libgbm1 libasound2 \
        libpangocairo-1.0-0 libgtk-3-0 libxshmfence1 && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY services/crawl4ai/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Crawl4AI browser (headless Chromium)
RUN crawl4ai-setup

COPY services/crawl4ai/server.py .

# Run as non-root (Semgrep: missing-user-entrypoint)
RUN adduser --disabled-password --gecos '' appuser
USER appuser

EXPOSE 8000

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
