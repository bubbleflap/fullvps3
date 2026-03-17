#!/bin/bash
set -e

VPS_USER="root"
VPS_HOST="203.161.41.61"
VPS_DIR="/home/bubbleflap/bubbleflap.fun"
SSH_KEY=".deploy/id_ed25519"
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no"
RSYNC="rsync -avz --progress -e 'ssh -i $SSH_KEY -o StrictHostKeyChecking=no'"

if [ ! -f "$SSH_KEY" ]; then
  echo "ERROR: SSH key not found at $SSH_KEY"
  echo "Run setup-deploy-key.sh first to restore the key."
  exit 1
fi

echo "=== Building frontend ==="
npx vite build

echo "=== Copying build to public/ ==="
cp dist/index.html public/index.html
rm -f public/assets/index-*.js public/assets/index-*.css
cp dist/assets/* public/assets/

echo "=== Syncing files to VPS ==="
rsync -avz --progress \
  -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
  --exclude='node_modules/' \
  --exclude='.git/' \
  --exclude='.cache/' \
  --exclude='.local/' \
  --exclude='.deploy/' \
  --exclude='dist/' \
  --exclude='*.zip' \
  --exclude='attached_assets/' \
  --exclude='*.sql' \
  --exclude='dev.sh' \
  --exclude='deploy.sh' \
  --exclude='build.sh' \
  --exclude='vite.config.ts' \
  --exclude='tsconfig.json' \
  --exclude='src/' \
  --exclude='contracts/' \
  ./ "$VPS_USER@$VPS_HOST:$VPS_DIR/"

echo "=== Installing dependencies on VPS (if needed) ==="
$SSH "$VPS_USER@$VPS_HOST" "cd $VPS_DIR && npm install --omit=dev 2>&1 | tail -5"

echo "=== Restarting app on VPS ==="
$SSH "$VPS_USER@$VPS_HOST" "pm2 restart bubbleflap && pm2 save"

echo ""
echo "=== Deploy complete! ==="
echo "Live at: https://bubbleflap.fun"
