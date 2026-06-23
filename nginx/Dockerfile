FROM nginx:alpine

# 安装 certbot（用于 HTTPS 自动续签）
RUN apk add --no-cache certbot certbot-nginx

COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY logibridge-web/dist /usr/share/nginx/html

# Certbot 验证目录
RUN mkdir -p /var/www/certbot

EXPOSE 80 443
