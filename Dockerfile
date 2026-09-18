# The multiplayer room server.
#
# Only this half of EVARRA? needs a container. The daily game is static files and
# deploys to a CDN; a room is a process that has to hold a clock and stay alive
# between requests, and this is how it gets somewhere that can run one. Any host
# that takes a Dockerfile — Fly.io, Render, Railway, a VPS — will run it unchanged.
#
#   docker build -t evarra-rooms .
#   docker run -p 8787:8787 -e MULTIPLAYER_ORIGINS=https://ysai258.github.io evarra-rooms
FROM node:22-slim

WORKDIR /app

# Dependencies first, so a change to the game does not reinstall them. Dev
# dependencies are included on purpose: the server runs its TypeScript through tsx
# rather than a build step, which keeps one source of truth for the rules the browser
# and the server share.
COPY package.json package-lock.json ./
RUN npm ci

# The server needs the dataset to know who the stars are, the shared rules it runs on,
# and — unusually for a server — the image assets themselves, because it answers with
# blurred bytes rather than a filename. See server/assets.ts for why.
COPY server ./server
COPY src ./src
COPY public ./public
COPY tsconfig.json ./

ENV NODE_ENV=production
ENV MULTIPLAYER_PORT=8787
EXPOSE 8787

# Never root: this process talks to the open internet.
USER node

CMD ["npx", "tsx", "server/index.ts"]
