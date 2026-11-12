#!/bin/sh
# GitHub Pages 배포 — 빌드한 dist/를 gh-pages 브랜치에 통째로 올린다.
# 주소: https://arangpa-cyber.github.io/trading-musal-web/
set -e
cd "$(dirname "$0")/.."
npm run typecheck
npm test
npm run build
touch dist/.nojekyll
REMOTE=$(git remote get-url origin)
cd dist
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="Arangpa-cyber" -c user.email="kimkkomkkom@gmail.com" commit -q -m "배포 $(date '+%Y-%m-%d %H:%M')"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "배포 완료 — https://arangpa-cyber.github.io/trading-musal-web/ (반영까지 1~2분)"
