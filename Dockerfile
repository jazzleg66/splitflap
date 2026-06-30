# ── Digital Solari — production image ─────────────────────────────────────────
FROM node:20-alpine

# Puppeteer is a dev-only dependency (screenshots); never fetch Chromium here.
ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV NODE_ENV=production

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy the application.
COPY . .

EXPOSE 3000

# Container-level health check hits the /health endpoint.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server/index.js"]
