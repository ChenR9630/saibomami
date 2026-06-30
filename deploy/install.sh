#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# SAIBOMAMI 腾讯云 Lighthouse 一键部署脚本
# 用法: curl -sSL https://raw.githubusercontent.com/ChenR9630/saibomami/main/deploy/install.sh | bash
# 或:   ssh 上服务器后执行 bash deploy/install.sh
# ============================================================

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[OK]${NC}  $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERR]${NC}  $1"; }
info() { echo -e "${CYAN}[..]${NC}  $1"; }
step() { echo -e "\n${CYAN}=== $1 ===${NC}"; }

PROJECT_DIR="/var/www/saibomami"
DOMAIN="${SAIBOMAMI_DOMAIN:-}"
REPO_URL="https://github.com/ChenR9630/saibomami.git"

# --- Step 1: 检查系统 ---
step "1/8 检查系统环境"

if ! command -v apt &>/dev/null; then
  warn "非 Debian/Ubuntu 系统，跳过 apt 安装，请手动安装依赖"
else
  info "apt 可用，开始安装依赖..."
  sudo apt update -qq
  sudo apt install -y -qq git nginx nodejs npm certbot python3-certbot-nginx
fi

NODE_VERSION=$(node -v 2>/dev/null || echo "none")
log "Node.js 版本: ${NODE_VERSION}"
if [[ "$NODE_VERSION" != v1[89]* && "$NODE_VERSION" != v2[0-9]* ]]; then
  warn "请安装 Node.js 18+ (当前: ${NODE_VERSION})"
  warn "  运行: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs"
  exit 1
fi

# --- Step 2: 克隆项目 ---
step "2/8 克隆项目"

if [[ -d "$PROJECT_DIR/.git" ]]; then
  info "项目目录已存在，执行 git pull..."
  cd "$PROJECT_DIR"
  sudo -u www-data git pull --ff-only origin main || { err "git pull 失败，请手动处理"; exit 1; }
else
  sudo mkdir -p /var/www
  sudo chown "$USER":"$USER" /var/www
  git clone "$REPO_URL" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi

sudo chown -R www-data:www-data "$PROJECT_DIR"

# --- Step 3: 安装 Node 依赖 ---
step "3/8 安装 Node 依赖"

sudo -u www-data npm ci --omit=dev 2>/dev/null || {
  info "npm ci 失败，尝试 npm install..."
  sudo -u www-data npm install --omit=dev
}
log "依赖安装完成"

# --- Step 4: 配置环境变量 ---
step "4/8 配置环境变量"

if [[ ! -f .env.local ]]; then
  sudo -u www-data cp .env.example .env.local
  warn "已创建 .env.local，请编辑它填入真实的 API Key"
  warn "  sudo nano $PROJECT_DIR/.env.local"
  warn ""
  warn "  必填项:"
  warn "    PRODUCTION=true    (已默认)"
  warn "    ARK_API_KEY=       你的火山引擎 API Key"
  warn "    PAYMENT_ADMIN_TOKEN=一个长随机字符串"
  warn ""
  warn "  填好后重新运行此脚本继续。"
  exit 0
fi

# 确保 PRODUCTION=true
if grep -q '^PRODUCTION=false' .env.local 2>/dev/null; then
  sudo -u www-data sed -i 's/^PRODUCTION=false/PRODUCTION=true/' .env.local
  log "已将 PRODUCTION 设为 true"
fi

# --- Step 5: 创建必要目录 ---
step "5/8 创建运行时目录"

sudo -u www-data mkdir -p "$PROJECT_DIR/.generated/auth" \
  "$PROJECT_DIR/.generated/topology-tests" \
  "$PROJECT_DIR/.generated/avatar-reservations" \
  "$PROJECT_DIR/.generated/community-images" \
  "$PROJECT_DIR/scans"
log "运行时目录已创建"

# --- Step 6: 安装 systemd 服务 ---
step "6/8 安装 systemd 服务"

sudo cp "$PROJECT_DIR/deploy/saibomami.service" /etc/systemd/system/saibomami.service
sudo systemctl daemon-reload
sudo systemctl enable --now saibomami
sleep 2
sudo systemctl status saibomami --no-pager || true

# --- Step 7: 配置 Nginx ---
step "7/8 配置 Nginx"

if [[ -z "$DOMAIN" ]]; then
  DOMAIN=$(curl -sS ifconfig.me 2>/dev/null || echo "your-server-ip")
  warn "未设置 SAIBOMAMI_DOMAIN，使用 IP: $DOMAIN"
  warn "  如需绑定域名: export SAIBOMAMI_DOMAIN=your-domain.com 后重新运行"
fi

# 替换 Nginx 配置中的 placeholder 域名
sudo cp "$PROJECT_DIR/deploy/nginx-saibomami.conf" /etc/nginx/sites-available/saibomami
if [[ "$DOMAIN" == "your-server-ip" ]]; then
  # 用 IP 作为 server_name
  sudo sed -i "s/saibomami.example.com www.saibomami.example.com/_/g" /etc/nginx/sites-available/saibomami
else
  sudo sed -i "s/saibomami.example.com www.saibomami.example.com/$DOMAIN www.$DOMAIN/g" /etc/nginx/sites-available/saibomami
fi

sudo ln -sf /etc/nginx/sites-available/saibomami /etc/nginx/sites-enabled/saibomami
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t && sudo systemctl reload nginx
log "Nginx 已配置并重载"

# --- Step 8: 验证 ---
step "8/8 验证部署"

info "等待服务启动..."
sleep 2

echo ""
if curl -sf http://127.0.0.1:8000/api/health | python3 -m json.tool 2>/dev/null; then
  log "✅ 后端服务运行正常!"
else
  err "❌ 后端服务未响应，检查日志: sudo journalctl -u saibomami -n 50"
fi

# 从 .env.local 读取端口
PORT=$(grep -oP '^PORT=\K\d+' "$PROJECT_DIR/.env.local" 2>/dev/null || echo "8000")

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  部署完成!${NC}"
echo ""
echo -e "  后端端口: ${CYAN}127.0.0.1:${PORT}${NC}"
echo -e "  外网访问: ${CYAN}http://${DOMAIN}${NC}"
echo ""
echo -e "  查看日志: ${YELLOW}sudo journalctl -u saibomami -f${NC}"
echo -e "  重启服务: ${YELLOW}sudo systemctl restart saibomami${NC}"
echo ""
if [[ -n "$DOMAIN" ]] && [[ "$DOMAIN" != *.* ]]; then
  echo -e "  ${YELLOW}如需 HTTPS，先绑定域名到本机 IP，然后运行:${NC}"
  echo -e "  ${YELLOW}sudo certbot --nginx -d your-domain.com${NC}"
fi
echo -e "${GREEN}============================================${NC}"
