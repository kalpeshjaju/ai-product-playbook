# Pinned to stable release — update deliberately, not on every build
# See: https://github.com/BerriAI/litellm/releases
FROM ghcr.io/berriai/litellm:v1.81.12-stable.1

# Railway build context is repo root (RAILWAY_DOCKERFILE_PATH=services/litellm/Dockerfile)
COPY services/litellm/config.yaml /app/config.yaml
COPY services/litellm/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Run as non-root (Semgrep: missing-user-entrypoint)
USER nobody

ENTRYPOINT []
CMD ["/bin/sh", "/app/start.sh"]
