# TaipeiGuessr — one container serves the API, realtime (Socket.IO) and the web app.
#
#   docker build \
#     --build-arg VITE_GOOGLE_MAPS_API_KEY=... --build-arg VITE_GOOGLE_MAP_ID=... \
#     --build-arg VITE_SUPABASE_URL=... --build-arg VITE_SUPABASE_ANON_KEY=... \
#     -t taipei-guessr .

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY tools/geo-build/package.json tools/geo-build/
COPY tools/location-gen/package.json tools/location-gen/
RUN npm ci
COPY . .
# Vite inlines VITE_* variables at build time (the browser key is public by nature — restrict it by referrer).
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_GOOGLE_MAP_ID=DEMO_MAP_ID
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY \
    VITE_GOOGLE_MAP_ID=$VITE_GOOGLE_MAP_ID \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
# The server is a single self-contained bundle (no node_modules needed at runtime).
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
COPY apps/server/data apps/server/data
COPY supabase/migrations supabase/migrations
EXPOSE 8080
USER node
CMD ["node", "apps/server/dist/index.mjs"]
