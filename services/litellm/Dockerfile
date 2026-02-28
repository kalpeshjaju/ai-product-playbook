FROM ghcr.io/berriai/litellm:main-latest

COPY config.yaml /app/config.yaml
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

ENTRYPOINT []
CMD ["/bin/sh", "/app/start.sh"]
