#!/bin/bash
# =============================================================
# CashPulse — первоначальный деплой на VDS
# =============================================================
# Запускать ОДИН РАЗ с локальной машины:
#   bash scripts/deploy-vds.sh
#
# Предварительно:
#   1. Сгенерируйте SSH ключ:
#        ssh-keygen -t ed25519 -C "github-actions-cashpulse" -f ~/.ssh/cashpulse_deploy
#   2. Добавьте публичный ключ на VDS:
#        ssh-copy-id -i ~/.ssh/cashpulse_deploy.pub root@89.167.34.3
#      Или вручную добавьте содержимое ~/.ssh/cashpulse_deploy.pub
#      в /root/.ssh/authorized_keys на VDS
#   3. Добавьте приватный ключ в GitHub Secrets:
#        GitHub repo → Settings → Secrets → Actions → New secret
#        Name: VDS_SSH_KEY
#        Value: содержимое ~/.ssh/cashpulse_deploy (cat ~/.ssh/cashpulse_deploy)
# =============================================================

set -e

VDS_HOST="89.167.34.3"
VDS_USER="root"

echo "=== CashPulse VDS Setup ==="
echo "Подключаемся к ${VDS_USER}@${VDS_HOST}..."

ssh "${VDS_USER}@${VDS_HOST}" << 'ENDSSH'
set -e

echo "--- Проверка Docker ---"
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker не установлен! Установите Docker и повторите."
    exit 1
fi
echo "Docker: $(docker --version)"

echo "--- Создание директории /opt/cashpulse ---"
mkdir -p /opt/cashpulse

echo "--- Создание изолированной сети cashpulse-network ---"
# Создаём сеть только для CashPulse — не затрагиваем другие сервисы (VPN, ипотечный калькулятор и т.д.)
docker network create cashpulse-network 2>/dev/null && echo "Сеть создана" || echo "Сеть уже существует, пропускаем"

echo "--- Проверка MySQL ---"
if docker ps --format '{{.Names}}' | grep -q '^cashpulse-mysql$'; then
    echo "cashpulse-mysql уже запущен, пропускаем"
elif docker ps -a --format '{{.Names}}' | grep -q '^cashpulse-mysql$'; then
    echo "cashpulse-mysql существует но остановлен — запускаем"
    docker start cashpulse-mysql
else
    echo "Запускаем новый контейнер cashpulse-mysql..."

    # Проверяем что порт 3306 не занят другим контейнером
    if docker ps --format '{{.Ports}}' | grep -q '0.0.0.0:3306'; then
        echo "ВНИМАНИЕ: порт 3306 уже занят другим сервисом!"
        echo "MySQL будет запущен БЕЗ привязки к хосту (только внутри cashpulse-network)"
        docker run -d \
            --name cashpulse-mysql \
            --network cashpulse-network \
            --restart unless-stopped \
            -e MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-cashpulse_prod}" \
            -e MYSQL_DATABASE=cashpulse \
            -v cashpulse_mysql_data:/var/lib/mysql \
            mysql:8.0
    else
        docker run -d \
            --name cashpulse-mysql \
            --network cashpulse-network \
            --restart unless-stopped \
            -p 3306:3306 \
            -e MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-cashpulse_prod}" \
            -e MYSQL_DATABASE=cashpulse \
            -v cashpulse_mysql_data:/var/lib/mysql \
            mysql:8.0
    fi
    echo "cashpulse-mysql запущен"
fi

echo ""
echo "=== Готово! ==="
echo ""
echo "Текущие контейнеры CashPulse:"
docker ps --filter "name=cashpulse" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
echo "Следующий шаг: сделайте push в ветку main"
echo "GitHub Actions автоматически соберёт и задеплоит бэкенд."
ENDSSH
