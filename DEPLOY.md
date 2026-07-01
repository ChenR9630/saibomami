# SAIBOMAMI Deployment

This project is designed to run behind Nginx on a Tencent Cloud Lighthouse server.

## 1. Push Code

```bash
git remote add origin https://github.com/ChenR9630/saibomami.git
git add .
git commit -m "Initial SAIBOMAMI deployment"
git push -u origin main
```

## 2. Prepare Server

SSH into the Lighthouse instance and install runtime packages:

```bash
sudo apt update
sudo apt install -y git nginx nodejs npm certbot python3-certbot-nginx
node -v
npm -v
```

Node.js 18 or newer is recommended.

## 3. Clone Project

```bash
sudo mkdir -p /var/www
sudo chown "$USER":"$USER" /var/www
git clone https://github.com/ChenR9630/saibomami.git /var/www/saibomami
cd /var/www/saibomami
npm ci --omit=dev
```

## 4. Configure Environment

```bash
cp .env.example .env.local
nano .env.local
```

Minimum production values (most already defaulted correctly in .env.example):

```env
PRODUCTION=true
PORT=8000
LOG_LEVEL=info
PAYMENT_ADMIN_TOKEN=replace_with_a_long_random_token
CUSTOM_TWIN_PRICE_CNY=18.8
ARK_API_KEY=your_ark_api_key_here
```

Fill provider keys only for enabled features:

```env
ARK_API_KEY=
OPENAI_API_KEY=
TRIPO_API_KEY=
WECHAT_APP_ID=
WECHAT_APP_SECRET=
WECHAT_REDIRECT_URI=https://yutanggo.com/api/auth/wechat/callback
```

## 5. Install systemd Service

```bash
sudo cp deploy/saibomami.service /etc/systemd/system/saibomami.service
sudo chown -R www-data:www-data /var/www/saibomami
sudo systemctl daemon-reload
sudo systemctl enable --now saibomami
sudo systemctl status saibomami
```

## 6. Configure Nginx

Install the Nginx config, which is preconfigured for `yutanggo.com` and
`www.yutanggo.com`:

```bash
sudo cp deploy/nginx-saibomami.conf /etc/nginx/sites-available/saibomami
sudo ln -sf /etc/nginx/sites-available/saibomami /etc/nginx/sites-enabled/saibomami
sudo nginx -t
sudo systemctl reload nginx
```

## 7. Point Domain

In Tencent Cloud DNS, create an `A` record:

```text
@     A     your_server_public_ip
www   A     your_server_public_ip
```

## 8. Enable HTTPS

After DNS is resolved to the Lighthouse instance:

```bash
sudo certbot --nginx -d yutanggo.com -d www.yutanggo.com
```

## 9. Verify

```bash
curl -I http://127.0.0.1:8000
curl https://yutanggo.com/api/health
sudo journalctl -u saibomami -f
```

## Update Deployment

```bash
cd /var/www/saibomami
sudo -u www-data git pull
sudo -u www-data npm ci --omit=dev
sudo systemctl restart saibomami
```
