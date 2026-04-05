#!/bin/bash
set -e

echo "=== Changing xray port 443 -> 2443 ==="

# Copy config out of container
docker cp amnezia-xray:/opt/amnezia/xray/server.json /tmp/xray_server.json

# Change port using python3 (available on host Ubuntu)
python3 - <<'PYEOF'
import json
with open('/tmp/xray_server.json') as f:
    cfg = json.load(f)
cfg['inbounds'][0]['port'] = 2443
with open('/tmp/xray_server_new.json', 'w') as f:
    json.dump(cfg, f, indent=4)
print("Port changed to:", cfg['inbounds'][0]['port'])
PYEOF

# Copy back into container
docker cp /tmp/xray_server_new.json amnezia-xray:/opt/amnezia/xray/server.json

# Recreate container with new port mapping
echo "=== Recreating container with port 2443:2443 ==="
docker stop amnezia-xray
docker rm amnezia-xray
docker run -d \
    --name amnezia-xray \
    --restart unless-stopped \
    --cap-add NET_ADMIN \
    -p 2443:2443 \
    amnezia-xray

echo "=== Waiting 3 seconds ==="
sleep 3

echo "=== Container status ==="
docker ps | grep amnezia-xray

echo "=== Port check ==="
ss -tlnp | grep -E '2443|443'

echo "DONE"
