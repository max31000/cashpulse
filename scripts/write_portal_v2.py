#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# 1. Пишем HTML-файл главной страницы
html = """\
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Сервисы — mvv42.ru</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
*, *::before, *::after { box-sizing: border-box; }
body {
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 600px;
    margin: 80px auto;
    padding: 0 24px;
    background: #f8f9fa;
    color: #212529;
}
h1 { color: #1c7ed6; margin-bottom: 32px; }
ul { list-style: none; padding: 0; margin: 0; }
li { margin: 16px 0; }
a.service {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    background: white;
    border-radius: 10px;
    box-shadow: 0 1px 4px rgba(0,0,0,.08);
    text-decoration: none;
    color: inherit;
    transition: box-shadow .15s, transform .15s;
}
a.service:hover {
    box-shadow: 0 4px 16px rgba(0,0,0,.12);
    transform: translateY(-1px);
}
.icon { font-size: 28px; line-height: 1; }
.name { font-size: 1.1em; font-weight: 600; color: #1c7ed6; }
.desc { font-size: .875em; color: #868e96; margin-top: 2px; }
</style>
</head>
<body>
<h1>Сервисы</h1>
<ul>
  <li>
    <a class="service" href="/credit_calc/">
      <span class="icon">🏠</span>
      <div>
        <div class="name">Ипотечный стратег</div>
        <div class="desc">Калькулятор ИТ-ипотеки</div>
      </div>
    </a>
  </li>
  <li>
    <a class="service" href="/cashpulse/">
      <span class="icon">📊</span>
      <div>
        <div class="name">CashPulse</div>
        <div class="desc">Прогноз денежного потока</div>
      </div>
    </a>
  </li>
</ul>
</body>
</html>
"""

import os
os.makedirs('/var/www/portal', exist_ok=True)
with open('/var/www/portal/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("HTML written:", len(html), "bytes")

# 2. Пишем весь nginx конфиг заново — без return 200 с HTML в конфиге
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

    # credit_calc SPA
    location /credit_calc/ {
        root /var/www;
        try_files $uri $uri/ /credit_calc/index.html;
        expires -1;
        add_header Cache-Control "no-store";
    }
    location ~* ^/credit_calc/assets/.*\\.(js|css)$ {
        root /var/www;
        expires 7d;
        add_header Cache-Control "public";
    }
    location ~* ^/credit_calc/.*\\.(png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        root /var/www;
        expires 30d;
        add_header Cache-Control "public";
    }
    location = /credit_calc { return 301 /credit_calc/; }

    # cashpulse SPA
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

    # cashpulse API + health
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
    root /var/www/portal;
    gzip on; gzip_vary on; gzip_comp_level 6; gzip_min_length 1000;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    location = / {
        try_files /index.html =404;
        add_header Cache-Control "no-cache";
    }
    location /credit_calc/ {
        root /var/www;
        try_files $uri $uri/ /credit_calc/index.html;
        expires -1; add_header Cache-Control "no-store";
    }
    location ~* ^/credit_calc/assets/.*\\.(js|css)$ { root /var/www; expires 7d; add_header Cache-Control "public"; }
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
