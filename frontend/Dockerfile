# Rebuild regularly to pick up base image security patches
# docker compose build --no-cache && docker compose up -d

# --- Stage 1: build --------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_BASE_URL is baked into the compiled JS at build time (Vite has no
# server-side runtime, so this can't be an env var read at container start).
# "/api" is a same-origin relative path — nginx.conf proxies /api/* to the
# backend — so the built bundle works behind any domain/IP without a rebuild.
ENV VITE_API_BASE_URL=/api
RUN npm run build

# --- Stage 2: production ----------------------------------------------------
FROM nginx:alpine AS production

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# No Node.js, npm, or source code exists in this stage — only the compiled
# static assets and nginx itself.
#
# nginx:alpine's master process starts as root (required to bind port 80 and
# read /etc/nginx/conf.d) and immediately forks worker processes — which
# handle every actual request — as the low-privilege "nginx" user already
# built into this base image via the `user nginx;` directive in its default
# nginx.conf. Forcing the master process itself to a non-root USER here would
# stop it binding port 80 at all, so this relies on nginx's own built-in
# privilege-drop rather than a Dockerfile USER instruction.
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
