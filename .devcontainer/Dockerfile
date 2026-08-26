FROM rust:1.88.0-bookworm

ARG NODE_VERSION=22.14.0
ARG TARGETARCH

ENV DEBIAN_FRONTEND=noninteractive \
    RUSTUP_TOOLCHAIN=1.88.0 \
    CARGO_TERM_COLOR=always \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        git \
        libssl-dev \
        pkg-config \
        python3 \
        xz-utils \
    && rm -rf /var/lib/apt/lists/*

RUN case "${TARGETARCH}" in \
      amd64) node_arch=x64 ;; \
      arm64) node_arch=arm64 ;; \
      *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
    && curl --fail --silent --show-error --location \
      "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz" \
      --output /tmp/node.tar.xz \
    && tar --extract --file /tmp/node.tar.xz --strip-components=1 --directory /usr/local \
    && rm /tmp/node.tar.xz \
    && node --version \
    && npm --version \
    && rustc --version

WORKDIR /workspaces/GenOS

