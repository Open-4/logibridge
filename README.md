# LogiBridge

智能报关 · 全球物流合规平台

LogiBridge 提供港口搜索、HS 编码查询、海运运费估算、合规扫描、单证生成、货物追踪、咨询协作等一站式国际物流合规服务。

## 技术栈

- **前端**: React 19 + TypeScript 6 + Vite 8 + Ant Design 6 + Deck.gl + MapLibre GL
- **后端**: Python 3.11 + FastAPI + JWT 认证
- **部署**: Docker Compose (Nginx + Uvicorn)

---

## 本地开发

### 后端

```bash
cd data-pipeline

# 创建虚拟环境（首次）
python -m venv venv
source venv/Scripts/activate   # Windows
# source venv/bin/activate     # macOS / Linux

# 安装依赖
pip install -r requirements.txt
pip install python-jose[cryptography] passlib[bcrypt] python-multipart

# 启动服务
uvicorn api_server:app --host 0.0.0.0 --port 8000 --reload
```

后端默认运行在 `http://localhost:8000`。启动后自动加载 `output/` 目录下的港口、HS 编码、合规规则等数据。

### 前端

```bash
cd logibridge-web
npm install
npm run dev
```

前端默认运行在 `http://localhost:5173`。修改 `logibridge-web/.env` 中的 `VITE_API_BASE_URL` 可切换 API 地址。

---

## 生产部署

```bash
# 先构建前端
cd logibridge-web
npm run build

# 启动所有服务
docker-compose up -d --build
```

首次构建会自动：
1. 构建 `data-pipeline/Dockerfile` → 后端 API 服务
2. 构建 `nginx/Dockerfile` → Nginx 前端服务（代理 API 到后端）

访问 `http://localhost` 即可。

### 其他命令

```bash
# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重新构建单个服务
docker-compose build server
docker-compose build web

# 仅启动后端（前端另起）
docker-compose up -d server
```

---

## 项目结构

```
logibridge/
├── data-pipeline/           # 后端 API
│   ├── api_server.py        # FastAPI 主应用
│   ├── auth.py              # 用户认证模块
│   ├── freight_estimator.py # 运费估算
│   ├── tracking_models.py   # 货物追踪模型
│   ├── fetch_*.py           # 数据抓取脚本
│   ├── requirements.txt
│   ├── Dockerfile
│   └── output/              # 持久化数据（JSON）
├── logibridge-web/          # 前端
│   ├── src/
│   │   ├── api/             # API 调用层
│   │   ├── components/      # 通用组件
│   │   ├── pages/           # 页面
│   │   ├── store/           # Zustand 状态管理
│   │   └── ...
│   ├── package.json
│   └── .env
├── nginx/
│   ├── nginx.conf           # Nginx 反向代理配置
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | 前端 API 基础路径 |
| `LOGIBRIDGE_JWT_SECRET` | (开发默认密钥) | JWT 签名密钥 |

生产部署时务必修改 `docker-compose.yml` 中的 `SECRET_KEY` 环境变量。
