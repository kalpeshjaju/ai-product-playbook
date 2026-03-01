# Pinned to stable release — update deliberately, not on every build
# See: https://github.com/BerriAI/litellm/releases
FROM ghcr.io/berriai/litellm:v1.81.12-stable.1

COPY config.yaml /app/config.yaml
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENTRYPOINT []
CMD ["/bin/sh", "/app/start.sh"]
