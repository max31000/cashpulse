#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import subprocess

config = """# HTTPS nginx config for mvv42.ru
# HTTP -> HTTPS redirect
server {
    listen 80;
    server_name mvv42.ru www.mvv42.ru;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://mvv42.ru$request_uri;
    }
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
    tcp_nopush off;
    tcp_nodelay on;
    charset utf-8;

    server_tokens off;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    gzip on;
    gzip_vary on;
    gzip_comp_level 6;
    gzip_min_length 1000;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    root /var/www;

    location = / {
        default_type text/html;
        charset utf-8;
        return 200 "<!DOCTYPE html><html lang=ru><head><meta charset=UTF-8><title>\\u0421\\u0435\\u0440\\u0432\\u0438\\u0441\\u044b</title><style>body{font-family:system-ui;max-width:600px;margin:60px auto;padding:0 20px}h1{color:#1c7ed6}ul{list-style:none;padding:0}li{margin:12px 0}a{color:#1c7ed6;text-decoration:none;font-size:1.1em}.desc{color:#666;font-size:.9em;margin-left:8px}</style></head><body><h1>\\u0421\\u0435\\u0440\\u0432\\u0438\\u0441\\u044b</h1><ul><li><a href=/credit_calc>\\u0418\\u043f\\u043e\\u0442\\u0435\\u0447\\u043d\\u044b\\u0439 \\u0441\\u0442\\u0440\\u0430\\u0442\\u0435\\u0433</a><span class=desc>\\u2014 \\u043a\\u0430\\u043b\\u044c\\u043a\\u0443\\u043b\\u044f\\u0442\\u043e\\u0440 \\u0418\\u0422-\\u0438\\u043f\\u043e\\u0442\\u0435\\u043a\\u0438</span></li><li><a href=/cashpulse/>CashPulse</a><span class=desc>\\u2014 \\u043f\\u0440\\u043e\\u0433\\u043d\\u043e\\u0437 \\u0434\\u0435\\u043d\\u0435\\u0436\\u043d\\u043e\\u0433\\u043e \\u043f\\u043e\\u0442\\u043e\\u043a\\u0430</span></li></ul></body></html>";
    }

    location /credit_calc/ {
        try_files $uri $uri/ /credit_calc/index.html;
        expires -1;
        add_header Cache-Control "no-store";
    }

    location ~* ^/credit_calc/assets/.*\\.(js|css)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    location ~* ^/credit_calc/.*\\.(png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public";
    }

    location = /credit_calc {
        return 301 /credit_calc/;
    }

    location /cashpulse/ {
        try_files $uri $uri/ /cashpulse/index.html;
        expires -1;
        add_header Cache-Control "no-store";
    }

    location ~* ^/cashpulse/assets/.*\\.(js|css)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    location ~* ^/cashpulse/.*\\.(png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 30d;
        add_header Cache-Control "public";
    }

    location = /cashpulse {
        return 301 /cashpulse/;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }

    location /health {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
    }
}

# Default server on port 80 for direct IP access
server {
    listen 80 default_server;
    server_name _;

    sendfile off;
    tcp_nopush off;
    tcp_nodelay on;

    gzip on;
    gzip_vary on;
    gzip_comp_level 6;
    gzip_min_length 1000;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    root /var/www;

    location = / {
        return 200 "<html><head><meta charset=UTF-8><title>Services</title></head><body><ul><li><a href=/credit_calc>Credit Calc</a></li><li><a href=/cashpulse/>CashPulse</a></li></ul></body></html>";
        default_type text/html;
    }

    location /credit_calc/ {
        try_files $uri $uri/ /credit_calc/index.html;
        expires -1;
        add_header Cache-Control "no-store";
    }

    location ~* ^/credit_calc/assets/.*\\.(js|css)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    location = /credit_calc {
        return 301 /credit_calc/;
    }

    location /cashpulse/ {
        try_files $uri $uri/ /cashpulse/index.html;
        expires -1;
        add_header Cache-Control "no-store";
    }

    location ~* ^/cashpulse/assets/.*\\.(js|css)$ {
        expires 7d;
        add_header Cache-Control "public";
    }

    location = /cashpulse {
        return 301 /cashpulse/;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
"""

with open('/etc/nginx/sites-enabled/portal', 'w', encoding='utf-8') as f:
    f.write(config)
print("Config written OK, length:", len(config))
