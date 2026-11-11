FROM rust:1-slim-bookworm AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY web ./web
COPY supabase ./supabase
RUN cargo build --release --locked
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && useradd --system --uid 10001 whisper
COPY --from=build /app/target/release/whisper /usr/local/bin/whisper
USER 10001
ENV BIND=0.0.0.0:8787
EXPOSE 8787
CMD ["whisper"]
