#!/bin/bash
set -e

echo "Building frontend..."
npx vite build

echo "Deploying to public/..."
cp dist/index.html public/index.html
rm -f public/assets/index-*.js public/assets/index-*.css
cp dist/assets/* public/assets/

echo "Bumping build version..."
CURRENT=$(grep -o 'bflap_build_v[0-9]*' public/index.html | head -1 | grep -o '[0-9]*$')
NEXT=$((CURRENT + 1))
sed -i "s/bflap_build_v${CURRENT}/bflap_build_v${NEXT}/g" public/index.html index.html

echo "Done — bflap_build_v${NEXT} deployed to public/"
