# Сборка и запуск h2h-core.
# Java 17 — та же версия, что в CI и у разработчиков. Меняется здесь и в .gitea/workflows.

FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app

# Сначала только pom.xml: слой с зависимостями переиспользуется, пока он не изменился.
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -DskipTests package

FROM eclipse-temurin:17-jre
WORKDIR /app

# curl нужен для healthcheck в docker compose.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Приложение не должно работать под root.
RUN useradd --system --create-home --uid 10001 app
USER app

COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080
ENV JAVA_OPTS="-XX:MaxRAMPercentage=75"
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar app.jar"]
