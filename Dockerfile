# Produktionsbild: Spiel bauen und mit dem kleinen Node-Server ausliefern, der zusätzlich die Mehrspieler-
# Spielcodes vermittelt (server/rooms.mjs). Keine weiteren Abhängigkeiten zur Laufzeit.
# Coolify: Build Pack „Dockerfile“, Port 80.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=80 DIST=/app/dist
COPY server ./server
COPY --from=build /app/dist ./dist
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/api/health >/dev/null || exit 1
# HTTPS übernimmt der vorgeschaltete Proxy (z. B. Coolify/Traefik). Server-Sent Events (/api/rooms/…/events)
# brauchen keine besondere Proxy-Einstellung; der Server sendet alle 20 s ein Lebenszeichen.
CMD ["node", "server/server.mjs"]
