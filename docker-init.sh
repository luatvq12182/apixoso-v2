#!/usr/bin/env bash
# Chạy 1 lần sau khi docker compose up để khởi tạo dữ liệu
# Usage: bash docker-init.sh [--crawl]
set -e

echo "=== Seed Region + Province ==="
docker compose exec api node src/scripts/seed.js

if [[ "$1" == "--crawl" ]]; then
  echo ""
  echo "=== Crawl 3 năm kết quả (có thể mất ~80 phút) ==="
  docker compose exec api node src/scripts/crawl.js
fi

echo ""
echo "✓ Xong!"
