#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Финальный nginx конфиг.
credit_calc проксируется на контейнер :8081 (там актуальная версия).
cashpulse SPA раздаётся из /var/www/cashpulse (деплой через SCP).
Главная страница — /var/www/portal/index.html.
"""

nginx = """\
# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name mvv42.ru www.mvv42.ru;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 301 https://mvv42.ru$request_uri; }
}

# HTTPS on port 443
server {
    listen 443 ssl;
    server_name mvv42.ru www.mvv42.ru;

    ssl_certificate     /etc/letsencrypt/live/mvv42.ru/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mvv42.ru/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    sendfile off;
    tcp_nodelay on;
    charset utf-8;
    gzip on; gzip_vary on; gzip_comp_level 6; gzip_min_length 1000;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # Portal home page
    location = / {
        root /var/www/portal;
        try_files /index.html =404;
        add_header Cache-Control "no-cache";
    }

    # credit_calc — proxy to Docker container on :8081
    location /credit_calc/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 30s;
    }
    location = /credit_calc { return 301 /credit_calc/; }

    # cashpulse SPA — serve from /var/www (deployed via SCP in CI)
    location /cashpulse/ {
        root /var/www;
        try_files $uri $uri/ /cashpulse/index.html;
        expires -1;
        add_header Cache-Control "no-store";
    }
    location ~* ^/cashpulse/assets/.*\\.(js|css)$ {
        root /var/www;
        expires 7d;
        add_header Cache-Control "public";
    }
    location ~* ^/cashpulse/.*\\.(png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        root /var/www;
        expires 30d;
        add_header Cache-Control "public";
    }
    location = /cashpulse { return 301 /cashpulse/; }

    # cashpulse API + health (backend on :5000)
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }
    location = /health {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }
}

# Default server on port 80 for direct IP access
server {
    listen 80 default_server;
    server_name _;
    charset utf-8;
    gzip on; gzip_vary on; gzip_comp_level 6; gzip_min_length 1000;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    location = / {
        root /var/www/portal;
        try_files /index.html =404;
        add_header Cache-Control "no-cache";
    }
    location /credit_calc/ {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 30s;
    }
    location = /credit_calc { return 301 /credit_calc/; }
    location /cashpulse/ {
        root /var/www;
        try_files $uri $uri/ /cashpulse/index.html;
        expires -1; add_header Cache-Control "no-store";
    }
    location ~* ^/cashpulse/assets/.*\\.(js|css)$ { root /var/www; expires 7d; add_header Cache-Control "public"; }
    location = /cashpulse { return 301 /cashpulse/; }
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }
}
"""

with open('/etc/nginx/sites-enabled/portal', 'w', encoding='utf-8') as f:
    f.write(nginx)
print("nginx config written:", len(nginx), "bytes")
