FROM node:24-alpine AS frontend-build

WORKDIR /workspace/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21-alpine AS backend-build

WORKDIR /workspace
COPY backend/ ./backend/
COPY --from=frontend-build /workspace/frontend/dist/ ./backend/src/main/resources/static/
RUN mvn -B -f backend/pom.xml -DskipTests package

FROM eclipse-temurin:21-jre-alpine

WORKDIR /app
RUN addgroup -S clea && adduser -S clea -G clea
COPY --from=backend-build /workspace/backend/target/rsa-file-exchange-0.0.1-SNAPSHOT.jar /app/app.jar
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && chmod 0555 /app/docker-entrypoint.sh && chown -R clea:clea /app

USER clea
EXPOSE 8080
ENTRYPOINT ["sh", "/app/docker-entrypoint.sh"]
