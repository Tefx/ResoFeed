# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web-builder

WORKDIR /src

COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci

COPY scripts/resofeed-svelte-build-identity.mjs scripts/build-resofeed.sh ./scripts/
COPY web ./web
RUN set -eu; \
    build_identity="$(env -i PATH="$PATH" node ./scripts/resofeed-svelte-build-identity.mjs derive /src)"; \
    env -i PATH="$PATH" RESOFEED_SVELTE_BUILD_IDENTITY="$build_identity" npm --prefix web run build

FROM --platform=$BUILDPLATFORM golang:1.22-bookworm AS go-builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal
COPY --from=web-builder /src/web/build ./internal/resofeed/webui

ARG TARGETOS=linux
ARG TARGETARCH
ENV CGO_ENABLED=0
RUN set -eux; \
    arch="${TARGETARCH:-$(go env GOARCH)}"; \
    GOOS="$TARGETOS" GOARCH="$arch" go build -trimpath -ldflags="-s -w" -o /out/resofeed ./cmd/resofeed; \
    install -d -o 65532 -g 65532 -m 0755 /out/data

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

ARG RESOFEED_VERSION="v0.2.11"

LABEL org.opencontainers.image.title="ResoFeed" \
      org.opencontainers.image.version="${RESOFEED_VERSION}" \
      org.opencontainers.image.source="https://github.com/tefx/ResoFeed"

WORKDIR /app

COPY --from=go-builder --chown=65532:65532 /out/resofeed /app/resofeed
COPY --from=go-builder --chown=65532:65532 /out/data /data

USER 65532:65532
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/app/resofeed"]
