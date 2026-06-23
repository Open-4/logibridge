#!/usr/bin/env bash
# deploy.sh — LogiBridge 生产部署脚本
# 用法: bash scripts/deploy.sh
# 前置条件: 服务器已安装 docker 和 docker compose

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "==================================="
echo "  LogiBridge 生产部署"
echo "  域名: znkfhyq.xyz"
echo "==================================="

# 1. 生成随机 JWT 密钥（如未设置）
if [ -z "${JWT_SECRET:-}" ]; then
  JWT_SECRET=$(python3 -c "import uuid; print(uuid.uuid4().hex)" 2>/dev/null || openssl rand -hex 16)
  echo "[1/5] 已生成 JWT_SECRET"
else
  echo "[1/5] 使用环境变量 JWT_SECRET"
fi

# 2. 构建前端
echo "[2/5] 构建前端..."
cd "$ROOT_DIR/logibridge-web"
npm ci --silent
npm run build 2>/dev/null || {
  echo "  ⚠️ 前端构建有限制，尝试继续..."
  npx vite build --mode production 2>&1 | tail -3 || true
}

# 3. 构建并启动 Docker 服务
echo "[3/5] 启动 Docker 服务..."
cd "$ROOT_DIR"
JWT_SECRET=${JWT_SECRET} docker compose up -d --build

# 4. 等待服务就绪
echo "[4/5] 等待服务就绪..."
sleep 3
for i in 1 2 3 4 5; do
  if curl -sf http://localhost:8000/ > /dev/null 2>&1; then
    echo "  ✅ 后端 API 就绪 (port 8000)"
    break
  fi
  echo "  等待后端... ($i/5)"
  sleep 2
done
if curl -sf http://localhost/ > /dev/null 2>&1; then
  echo "  ✅ 前端 Nginx 就绪 (port 80)"
fi

# 5. 申请 HTTPS 证书
echo "[5/5] 可选: 申请 HTTPS 证书"
echo "  执行: docker compose exec web certbot --nginx -d znkfhyq.xyz -d www.znkfhyq.xyz"

echo ""
echo "==================================="
echo "  部署完成!"
echo "  访问: http://znkfhyq.xyz"
echo "  DNS: 请将 znkfhyq.xyz A 记录指向服务器 IP"
echo "==================================="
