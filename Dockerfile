FROM node:14-alpine

WORKDIR /usr/src/app

# Установка системных зависимостей для Puppeteer/Chrome в Alpine
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev \
    dbus

# Переменные окружения, чтобы Puppeteer использовал системный Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./

RUN npm install

COPY . .

# Create data directory if it doesn't exist
RUN mkdir -p data

EXPOSE 3080

CMD [ "npm", "start" ] 