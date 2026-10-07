# syntax=docker/dockerfile:1.7
# Сборка пакетов без Rust и Node на машине. Запуск — через scripts/build.mjs:
#   npm run build:docker            Windows и Linux
#   npm run build:linux             на Windows сам уходит сюда

FROM node:22-bookworm-slim AS node

# Linux — на Ubuntu 22.04: AppImage со старым glibc запускается и на свежих дистрибутивах.
FROM ubuntu:22.04 AS linux-toolchain
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl file pkg-config libssl-dev \
      libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev patchelf \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

FROM linux-toolchain AS build-linux
# linuxdeploy сам AppImage, а FUSE в контейнере нет.
ENV APPIMAGE_EXTRACT_AND_RUN=1
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/src-tauri/target,id=dbml-editor-target-linux \
    node scripts/build.mjs linux --out /out

# Windows — кросс-сборка через cargo-xwin. Ubuntu 24.04 ради NSIS 3.09:
# шаблону установщика Tauri нужен Win\RestartManager.nsh, в 3.08 его нет.
FROM ubuntu:24.04 AS windows-toolchain
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential ca-certificates curl nsis lld llvm clang \
    && rm -rf /var/lib/apt/lists/*
ENV PATH=/usr/lib/llvm-18/bin:$PATH
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm
ENV RUSTUP_HOME=/usr/local/rustup CARGO_HOME=/usr/local/cargo PATH=/usr/local/cargo/bin:$PATH
RUN curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable \
      --target x86_64-pc-windows-msvc \
    && cargo install --locked cargo-xwin
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

FROM windows-toolchain AS build-windows
# cargo-xwin при первой сборке скачивает Windows SDK и CRT от Microsoft — кэш между сборками.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/src/src-tauri/target,id=dbml-editor-target-windows \
    --mount=type=cache,target=/root/.cache/cargo-xwin,id=dbml-editor-xwin-ubuntu24 \
    node scripts/build.mjs windows --out /out

FROM scratch AS linux
COPY --from=build-linux /out/ /

FROM scratch AS windows
COPY --from=build-windows /out/ /

FROM scratch AS all
COPY --from=build-linux /out/ /
COPY --from=build-windows /out/ /
