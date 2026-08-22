FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git python3 python3-pip \
 && rm -rf /var/lib/apt/lists/* \
 && pip3 install --break-system-packages --no-cache-dir \
      "git+https://github.com/LucaDeLeo/gdoc.git@31b430909e0d94f7ea31269266307e734b8929d3"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server

ENV NODE_ENV=production GDOC_AUTO_UPDATE=0 DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server/remote.js"]
