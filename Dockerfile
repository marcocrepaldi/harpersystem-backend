FROM node:20

WORKDIR /app
COPY . .

RUN yarn install
RUN yarn build

ENV NODE_ENV=production
EXPOSE 3002