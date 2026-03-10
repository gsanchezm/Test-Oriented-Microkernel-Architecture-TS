FROM node:20.19-slim AS base
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .

# --- Plugin Targets ---

FROM base AS proxy
CMD ["npx", "ts-node", "src/kernel/chaos-proxy.ts"]

FROM base AS playwright-plugin
RUN npx playwright install --with-deps chromium
CMD ["npx", "ts-node", "src/plugins/playwright/server.ts"]

FROM base AS appium-plugin
CMD ["npx", "ts-node", "src/plugins/appium/server.ts"]

FROM base AS api-plugin
CMD ["npx", "ts-node", "src/plugins/api/server.ts"]

FROM base AS gatling-plugin
CMD ["npx", "ts-node", "src/plugins/gatling/server.ts"]

FROM base AS test-runner
CMD ["npx", "cucumber-js"]
