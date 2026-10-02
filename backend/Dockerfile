FROM node:20-slim

# Prisma needs OpenSSL; the transcoding worker needs FFmpeg
RUN apt-get update -y && apt-get install -y openssl ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the Prisma schema before installing so `postinstall` (prisma generate) works
COPY package*.json ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .

EXPOSE 3000

# Create/update tables, then start the API
CMD ["sh", "-c", "npx prisma db push --skip-generate && node src/server.js"]
