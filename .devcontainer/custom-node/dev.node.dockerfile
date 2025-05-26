# syntax=docker/dockerfile:1

ARG NODE_VERSION_BASE="20" # Or pin to a specific LTS version, e.g., "20.11.1"
ARG OTELCOL_IMAGE_TAG_BASE="latest"
ARG USERNAME_BASE=vscode

# Stage 1: Node.js Preparer (use official Node image)
FROM node:${NODE_VERSION_BASE}-bookworm-slim AS node_prep
ARG USERNAME_BASE
# Optionally create user in this stage if you want to copy home directory files

# Stage 2: OTEL Collector Preparer
FROM otel/opentelemetry-collector-contrib:${OTELCOL_IMAGE_TAG_BASE} AS otel_collector_binary_source

# Stage 3: Final Base Image
FROM debian:bookworm-slim
ARG USERNAME_BASE
ARG USER_UID_BASE=1000
ARG USER_GID_BASE=${USER_UID_BASE}

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    bash \
    curl \
    gh \
    ca-certificates \
    sudo \
    && groupadd --gid ${USER_GID_BASE} ${USERNAME_BASE} \
    && useradd --uid ${USER_UID_BASE} --gid ${USER_GID_BASE} -m -s /bin/bash ${USERNAME_BASE} \
    && echo ${USERNAME_BASE} ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/${USERNAME_BASE} \
    && chmod 0440 /etc/sudoers.d/${USERNAME_BASE} \
    && rm -rf /var/lib/apt/lists/*

COPY --from=node_prep /usr/local/bin/node /usr/local/bin/node
COPY --from=node_prep /usr/local/bin/npm /usr/local/bin/npm
COPY --from=node_prep /usr/local/bin/npx /usr/local/bin/npx
COPY --from=node_prep /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=otel_collector_binary_source /otelcol-contrib /usr/local/bin/otelcol-contrib
RUN chmod +x /usr/local/bin/otelcol-contrib
RUN chown -R ${USERNAME_BASE}:${USER_GID_BASE} /usr/local/lib/node_modules

ENV PATH="/usr/local/lib/node_modules/npm/bin:/usr/local/bin:${PATH}"
ENV HOME="/home/${USERNAME_BASE}"

USER ${USERNAME_BASE}
WORKDIR /home/${USERNAME_BASE}/app

SHELL ["/bin/bash", "-c"]
CMD ["/bin/bash"]
