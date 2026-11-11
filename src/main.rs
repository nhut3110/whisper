use whisper::{App, cleanup, database, router};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let url = std::env::var("DATABASE_URL").unwrap_or("sqlite://hush.db?mode=rwc".into());
    let origin = std::env::var("APP_ORIGIN").unwrap_or("http://localhost:8787".into());
    let bind = std::env::var("BIND").unwrap_or("127.0.0.1:8787".into());
    let pepper = std::env::var("PIN_PEPPER")
        .map_err(|_| "PIN_PEPPER is required (32+ random characters)")?;
    if pepper.len() < 32 {
        return Err("PIN_PEPPER must be at least 32 characters".into());
    }
    if !origin.starts_with("https://")
        && !(origin == "http://localhost:8787" || origin == "http://127.0.0.1:8787")
    {
        return Err("Use HTTPS outside localhost".into());
    }
    let pool = database(&url).await?;
    cleanup(&pool).await?;
    let cleaning = pool.clone();
    tokio::spawn(async move {
        let mut timer = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            timer.tick().await;
            if cleanup(&cleaning).await.is_err() {
                eprintln!("Expiry cleanup failed; will retry.");
            }
        }
    });
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    println!("Whisper ready at {origin}; no request/content logging enabled.");
    axum::serve(listener, router(App::new(pool, origin, pepper))).await?;
    Ok(())
}
