# Backend (NestJS)
FROM node:20

WORKDIR /app

# Instala dependências primeiro (cache melhor)
COPY package.json yarn.lock* ./
RUN yarn install --frozen-lockfile

# Código-fonte
COPY . .

# Ambiente e build
ENV NODE_ENV=production
# Gera Prisma Client se existir schema (não falha se não houver)
RUN if [ -f prisma/schema.prisma ]; then npx prisma generate; fi
RUN yarn build

# Porta do app (compose publica via Traefik)
EXPOSE 3001

# Atenção: seu build gera dist/src/main.js (não dist/main.js)
CMD ["node", "dist/src/main.js"]
