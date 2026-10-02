# Production deployment

This setup runs StreamBox on one Ubuntu ARM VM with Docker Compose and automatic HTTPS from Caddy.

1. Create an Oracle Cloud Always Free ARM VM (Ubuntu, 2 OCPU / 12 GB RAM, about 100 GB boot volume).
2. Allow inbound TCP ports 80 and 443 in the Oracle security list and the VM firewall:

   ```bash
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

3. Install Docker and point DNS records for the app and file hostnames at the VM's public IP:

   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   ```
4. Clone this repository and prepare secrets:

   ```bash
   cp .env.production.example .env
   ```

   Set `APP_DOMAIN` and `S3_DOMAIN` to the DNS names, and fill in unique hex secrets and passwords. Never commit `.env`.
5. Start the production stack:

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

   Only Caddy publishes ports 80 and 443. It routes API requests to Express, sends other app paths to the React `index.html`, and proxies the file hostname to MinIO without changing the host used for presigned URLs.
6. Sign up on the site, then promote that account to admin from the VM:

   ```bash
   docker compose -f docker-compose.prod.yml exec mysql \
     mysql -u root -p streambox -e "UPDATE User SET role='admin' WHERE email='you@example.com';"
   ```

   Enter the `MYSQL_ROOT_PASSWORD` when prompted. Production does not seed a demo admin.
7. Optional: seed demo titles with `docker compose -f docker-compose.prod.yml exec api node prisma/seed.js`. For Google sign-in, add `https://<APP_DOMAIN>/auth/google/callback` as an OAuth redirect URI and fill in the Google credentials in `.env`.

The current `pgsty/minio:latest` manifest includes `linux/arm64`. If a future tag lacks ARM64 support, a pinned `minio/minio` tag is a fallback.
