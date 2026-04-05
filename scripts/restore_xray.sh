#!/bin/bash
set -e

PRIVATE_KEY=$(docker exec amnezia-xray cat /opt/amnezia/xray/xray_private.key)
SHORT_ID=$(docker exec amnezia-xray cat /opt/amnezia/xray/xray_short_id.key)

echo "Private key: $PRIVATE_KEY"
echo "Short ID: $SHORT_ID"

# Восстанавливаем server.json с портом 2443
cat > /tmp/xray_server_restored.json << JSONEOF
{
    "inbounds": [
        {
            "port": 2443,
            "protocol": "vless",
            "settings": {
                "clients": [
                    {"flow": "xtls-rprx-vision", "id": "6289ae32-80c1-4643-84df-37c7731f7ffc"},
                    {"flow": "xtls-rprx-vision", "id": "3283a778-89d3-40e4-8554-64bc34ae0107"},
                    {"flow": "xtls-rprx-vision", "id": "7a3942f1-4df0-45db-b5f8-ca0bc4cbc51f"},
                    {"flow": "xtls-rprx-vision", "id": "2639e40e-4439-4f56-bf86-9409871587e7"},
                    {"flow": "xtls-rprx-vision", "id": "4f8ea0d1-6fcd-4e00-abf3-15f94ae7ae02"}
                ],
                "decryption": "none"
            },
            "streamSettings": {
                "network": "tcp",
                "realitySettings": {
                    "dest": "www.googletagmanager.com:443",
                    "privateKey": "$PRIVATE_KEY",
                    "serverNames": ["www.googletagmanager.com"],
                    "shortIds": ["$SHORT_ID"]
                },
                "security": "reality"
            }
        }
    ],
    "log": {"loglevel": "error"},
    "outbounds": [{"protocol": "freedom"}]
}
JSONEOF

echo "=== Restored config (port check) ==="
grep port /tmp/xray_server_restored.json

echo "=== Copying config into container ==="
docker cp /tmp/xray_server_restored.json amnezia-xray:/opt/amnezia/xray/server.json

echo "=== Verifying ==="
docker exec amnezia-xray cat /opt/amnezia/xray/server.json | grep port

echo "=== Recreating container with port 2443 ==="
docker stop amnezia-xray
docker rm amnezia-xray
docker run -d \
    --name amnezia-xray \
    --restart unless-stopped \
    --cap-add NET_ADMIN \
    -p 2443:2443 \
    amnezia-xray

sleep 3
echo "=== Status ==="
docker ps | grep amnezia-xray
ss -tlnp | grep -E '443'
echo "DONE"
