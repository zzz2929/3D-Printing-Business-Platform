# 3D打印业务平台 · Node 服务 + 文件存储（Docker / 飞牛OS / 群晖等 NAS）
FROM node:22-alpine

WORKDIR /app
COPY index.html sw.js manifest.webmanifest icon.svg /app/
COPY assets /app/assets
COPY server /app/server
COPY api /app/api

ENV PORT=2929 DATA_DIR=/data
VOLUME /data
EXPOSE 2929
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/api/settings >/dev/null 2>&1 || exit 1

CMD ["node", "server/index.mjs"]
