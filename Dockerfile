# 灵犀工作台 · Dockerfile
# 零依赖 Node.js 应用，单容器即可运行
FROM node:20-alpine
WORKDIR /app

# 数据卷挂载点（db.json / 上传文件 / secret）
VOLUME ["/app/server/data"]

COPY . .

EXPOSE 3000
CMD ["node", "server/server.js"]
