# syntax=docker/dockerfile:1
# Dockerfile for your common base development image

ARG DENO_VERSION_BASE="latest" # Or pin to a specific stable version, e.g., "1.40.0"
ARG OTELCOL_IMAGE_TAG_BASE="latest" # Or pin to a specific stable version
ARG USERNAME_BASE=vscode

# Stage 1: Deno Preparer
FROM debian:bookworm-slim AS deno_prep
ARG DENO_VERSION_BASE
ARG USERNAME_BASE
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    sudo \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV DENO_INSTALL=/home/${USERNAME_BASE}/.deno
RUN echo "Installing Deno version: ${DENO_VERSION_BASE} to ${DENO_INSTALL}" && \
    if [ -z "${DENO_VERSION_BASE}" ] || [ "${DENO_VERSION_BASE}" = "latest" ]; then \
    echo "Installing latest version of Deno"; \
    curl -fsSL https://deno.land/install.sh | sudo DENO_INSTALL=${DENO_INSTALL} sh -s; \
    else \
    echo "Installing specific version of Deno: ${DENO_VERSION_BASE}"; \
    # Ensure 'v' prefix if the specific version tag requires it (e.g., v1.2.3)
    curl -fsSL https://deno.land/install.sh | sh -s "v${DENO_VERSION_BASE}"; \
    fi
RUN sudo chmod -R +x ${DENO_INSTALL}/bin

# Stage 2: OTEL Collector Preparer
FROM otel/opentelemetry-collector-contrib:${OTELCOL_IMAGE_TAG_BASE} AS otel_collector_binary_source

# Stage 3: Final Base Image
FROM debian:bookworm-slim
ARG USERNAME_BASE
ARG USER_UID_BASE=1000
ARG USER_GID_BASE=${USER_UID_BASE} # Defaults GID to UID

# ENV DEBIAN_FRONTEND=noninteractive

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

COPY --from=deno_prep /home/${USERNAME_BASE}/.deno /home/${USERNAME_BASE}/.deno
COPY --from=otel_collector_binary_source /otelcol-contrib /usr/local/bin/otelcol-contrib
RUN chmod +x /usr/local/bin/otelcol-contrib
RUN chown -R ${USERNAME_BASE}:${USER_GID_BASE} /home/${USERNAME_BASE}/.deno 

ENV PATH="/home/${USERNAME_BASE}/.deno/bin:${PATH}"
# DENO_DIR setup for the default user.
# Ensure this path matches where you want Deno to store its cache for the user.
ENV DENO_DIR="/home/${USERNAME_BASE}/.cache/deno"
ENV HOME="/home/${USERNAME_BASE}"
RUN mkdir -p ${DENO_DIR} && chown ${USERNAME_BASE}:${USER_GID_BASE} ${DENO_DIR}

# Switch to non-root user by default
USER ${USERNAME_BASE}
WORKDIR /home/${USERNAME_BASE}/app # Default working directory

# Optional: Verify installations in the base image itself
# RUN echo "Verifying Deno in base..." && deno --version
# RUN echo "Verifying OTEL Collector in base..." && otelcol-contrib --version

SHELL ["/bin/bash", "-c"]
CMD ["/bin/bash"] # Default command if the container is run directly