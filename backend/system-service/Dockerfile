FROM maven:3.9.9-eclipse-temurin-17 AS builder

WORKDIR /build

COPY backend/system-service/pom.xml .
COPY backend/system-service/src ./src

RUN mvn -q -DskipTests package

FROM eclipse-temurin:17-jre

WORKDIR /app

COPY --from=builder /build/target/system-service-0.1.0.jar app.jar

EXPOSE 8081

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
