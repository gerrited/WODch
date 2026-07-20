FROM --platform=$BUILDPLATFORM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Nicht-privilegiertes Image (SECURITY_REVIEW Befund 8): läuft als User nginx
# (UID 101), lauscht auf 8080, pid-File in /tmp — kein root nötig.
FROM nginxinc/nginx-unprivileged:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
