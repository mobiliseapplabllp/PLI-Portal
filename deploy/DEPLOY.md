# PLI Portal — Deployment Guide (Production + UAT)

## Environment Summary

| | Production | UAT |
|---|---|---|
| Domain | lakshya.onmobilise.com | lakshyauat.onmobilise.com |
| Backend Port | 5105 | 5106 |
| Database | pli_portal | pli_portal_uat |
| Server Path | /home/lakshya/PLI-Portal-master/ | /home/lakshyauat/PLI-Portal-uat/ |
| PM2 Name | pli-portal-production | pli-portal-uat |

---

## STEP 1 — Build Frontend (on your Windows machine)

Open terminal in `c:\React\PLI-Portal\frontend\`

**For Production:**
```
npm run build:prod
```
Output folder: `frontend\dist\`

**For UAT:**
```
npm run build:uat
```
Output folder: `frontend\dist\`

> Build one at a time — both output to the same `dist\` folder.
> Upload immediately after each build.

---

## STEP 2 — Upload via WinSCP

### Upload Frontend Build

After `npm run build:prod`:
- Connect WinSCP to **production** server
- Upload contents of `frontend\dist\` → `/home/lakshya/PLI-Portal-master/frontend/dist/`
- Select all files → drag and drop (choose **Overwrite**)

After `npm run build:uat`:
- Connect WinSCP to **lakshyauat** server
- Upload contents of `frontend\dist\` → `/home/lakshyauat/PLI-Portal-uat/frontend/dist/`

### Upload Backend (only when code changes)

Upload the `backend\` folder excluding `node_modules\`:
- `backend\src\` → `/home/lakshya/PLI-Portal-master/backend/src/`
- `backend\server.js` → `/home/lakshya/PLI-Portal-master/backend/server.js`
- `backend\package.json` → `/home/lakshya/PLI-Portal-master/backend/package.json`

Do the same for UAT with `/home/lakshyauat/PLI-Portal-uat/` path.

**Never upload `node_modules\` — run `npm install` on the server instead.**

---

## STEP 3 — Server Setup (first time only)

SSH into the server and run these once per environment.

### Production
```bash
cd /home/lakshya/PLI-Portal-master/backend
npm install --production

# Create .env from template (edit values)
cp /path/to/uploaded/.env.example .env
nano .env
# Set: PORT=5105, MYSQL_DATABASE=pli_portal, JWT_SECRET=<strong-key>

# Create log folder
mkdir -p /home/lakshya/logs

# Start with PM2
pm2 start ecosystem.config.js --only pli-portal-production
pm2 save
pm2 startup
```

### UAT
```bash
cd /home/lakshyauat/PLI-Portal-uat/backend
npm install --production

# Copy .env.uat as .env
cp .env.uat .env
# Edit: PORT=5106, MYSQL_DATABASE=pli_portal_uat, set real JWT_SECRET

# Create log folder
mkdir -p /home/lakshyauat/logs

# Create UAT database
mysql -u mysql_admin -p -e "CREATE DATABASE IF NOT EXISTS pli_portal_uat;"

# Start with PM2
pm2 start /home/lakshya/PLI-Portal-master/deploy/ecosystem.config.js --only pli-portal-uat
pm2 save
```

---

## STEP 4 — Apache Config (first time only)

### UAT Virtual Host
```bash
sudo cp /home/lakshyauat/PLI-Portal-uat/deploy/apache-uat.conf.example \
        /etc/apache2/sites-available/lakshyauat.onmobilise.com.conf

sudo a2ensite lakshyauat.onmobilise.com
sudo a2enmod proxy proxy_http
sudo systemctl reload apache2
```

### SSL Certificate for UAT
```bash
sudo certbot --apache -d lakshyauat.onmobilise.com
```

---

## STEP 5 — After Every Backend Code Change

SSH into server and restart the right PM2 process:

```bash
# Production
pm2 restart pli-portal-production

# UAT
pm2 restart pli-portal-uat
```

No restart needed for frontend-only changes (static files served directly by Apache).

---

## Useful Commands

```bash
# Check both are running
pm2 list

# View live logs
pm2 logs pli-portal-production
pm2 logs pli-portal-uat

# Check backend is responding
curl http://127.0.0.1:5105/api/health
curl http://127.0.0.1:5106/api/health

# Reload Apache after config change
sudo systemctl reload apache2

# Check Apache error log
sudo tail -f /var/log/apache2/error.log
```

---

## Quick Deploy Checklist

### Frontend only change
- [ ] `npm run build:prod` → upload `dist\` to production
- [ ] `npm run build:uat` → upload `dist\` to UAT
- [ ] Hard refresh browser (Ctrl+Shift+R)

### Backend code change
- [ ] Upload changed `src\` files via WinSCP
- [ ] SSH → `pm2 restart pli-portal-production` (and/or UAT)
- [ ] Check `pm2 logs` for errors

### Full deploy (both)
- [ ] Build frontend → upload dist
- [ ] Upload backend src
- [ ] Restart PM2
- [ ] Test both environments
