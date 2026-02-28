# DSPy Prompt Optimization Service
#
# WHY: Containerized prompt optimizer for consistent execution.
# HOW: Python 3.11-slim with DSPy + LiteLLM. Runs optimize.py with args.
#
# BUILD: docker build -t dspy-optimizer services/dspy/
# RUN:   docker run --env-file .env dspy-optimizer --prompt-name job_match_scoring

FROM python:3.11-slim

WORKDIR /app

# Install dependencies first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENTRYPOINT ["python", "optimize.py"]
