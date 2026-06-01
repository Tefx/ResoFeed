# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web-builder

WORKDIR /src

COPY web/package.json web/package-lock.json ./web/
RUN npm --prefix web ci

COPY web ./web
RUN npm --prefix web run build

FROM --platform=$BUILDPLATFORM golang:1.22-bookworm AS go-builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd ./cmd
COPY internal ./internal

ARG TARGETOS=linux
ARG TARGETARCH
ENV CGO_ENABLED=0
RUN set -eux; \
    arch="${TARGETARCH:-$(go env GOARCH)}"; \
    GOOS="$TARGETOS" GOARCH="$arch" go build -trimpath -ldflags="-s -w" -o /out/resofeed ./cmd/resofeed; \
    install -d -o 65532 -g 65532 -m 0755 /out/data

FROM gcr.io/distroless/static-debian12:nonroot AS runtime

WORKDIR /app

COPY --from=go-builder --chown=65532:65532 /out/resofeed /app/resofeed
COPY --from=web-builder --chown=65532:65532 /src/web/build /app/web/build
COPY --from=go-builder --chown=65532:65532 /out/data /data

USER 65532:65532
VOLUME ["/data"]
EXPOSE 8080
ENTRYPOINT ["/app/resofeed"]
