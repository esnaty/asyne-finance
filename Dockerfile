FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
RUN npm ci
COPY frontend frontend
COPY backend backend
EXPOSE 3000 5173
CMD ["npm", "run", "start", "-w", "backend"]
