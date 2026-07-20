FROM --platform=$BUILDPLATFORM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
# Nicht als root laufen (SECURITY_REVIEW Befund 8): node-User = UID 1000 im
# offiziellen Image. Numerisch, damit k8s runAsNonRoot ihn verifizieren kann
# (ein Name wäre nicht prüfbar). App schreibt nichts ins Dateisystem.
USER 1000
EXPOSE 8787
CMD ["node", "dist/index.js"]
