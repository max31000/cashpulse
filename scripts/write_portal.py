#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Пишет главную страницу-портал прямо в nginx конфиг как файл,
а не как return 200 в nginx (чтобы избежать проблем с кодировкой).
"""

import os
import subprocess

# HTML главной страницы — пишем как отдельный файл
html = """<!DOCTYPE html>
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

os.makedirs('/var/www/portal', exist_ok=True)
with open('/var/www/portal/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print("Portal index.html written:", len(html), "bytes")

# Теперь обновляем nginx конфиг — заменяем return 200 на alias к файлу
nginx_https = open('/etc/nginx/sites-enabled/portal', encoding='utf-8').read()

old = '''    location = / {
        default_type text/html;
        charset utf-8;
        return 200 "<!DOCTYPE html>'''

# Находим блок location = / и заменяем на отдачу файла
import re

# Заменяем location = / в HTTPS блоке (первое вхождение)
new_location = '''    location = / {
        root /var/www/portal;
        try_files /index.html =404;
        add_header Cache-Control "no-cache";
    }'''

# Найдём и заменим location = / с return 200 в обоих серверных блоках
pattern = r'    location = / \{[^}]+return 200[^}]+\}'
matches = re.findall(pattern, nginx_https, re.DOTALL)
print(f"Found {len(matches)} 'location = /' blocks to replace")

result = re.sub(pattern, new_location, nginx_https, count=2, flags=re.DOTALL)

with open('/etc/nginx/sites-enabled/portal', 'w', encoding='utf-8') as f:
    f.write(result)
print("nginx config updated")
