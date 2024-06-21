FROM node:22 as builder

WORKDIR /app
COPY . .

RUN npm install --save-exact && npm run build

FROM node:slim
WORKDIR /app
EXPOSE 9090

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/dist ./dist
RUN npm install --omit=dev
CMD npm run start:prod
