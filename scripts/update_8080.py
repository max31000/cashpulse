nginx8080 = """server {
    listen 8080 default_server;
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
    }
    location ~* ^/credit_calc/assets/ { root /var/www; expires 7d; }
    location = /credit_calc { return 301 /credit_calc/; }
    location /cashpulse/ {
        root /var/www;
        try_files $uri $uri/ /cashpulse/index.html;
    }
    location = /cashpulse { return 301 /cashpulse/; }
}
"""
with open('/etc/nginx/sites-enabled/portal_8080', 'w', encoding='utf-8') as f:
    f.write(nginx8080)
print("portal_8080 updated")
