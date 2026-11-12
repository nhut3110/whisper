use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Request, State},
    http::{HeaderValue, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use rand::{RngCore, rngs::OsRng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{AnyPool, Row};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

pub const SCHEMA: &str = include_str!("../supabase/migrations/202611110001_messages.sql");
#[derive(Clone)]
pub struct App {
    pub pool: AnyPool,
    pub origin: String,
    pub pepper: String,
    challenges: Arc<Mutex<HashMap<String, Challenge>>>,
    limiter: Arc<Mutex<HashMap<&'static str, (Instant, u32)>>>,
}
impl App {
    pub fn new(pool: AnyPool, origin: String, pepper: String) -> Self {
        Self {
            pool,
            origin,
            pepper,
            limiter: Arc::default(),
            challenges: Arc::default(),
        }
    }
    fn limit(&self, name: &'static str, max: u32) -> Result<(), ApiError> {
        let mut map = self.limiter.lock().map_err(|_| ApiError::unavailable())?;
        let e = map.entry(name).or_insert((Instant::now(), 0));
        if e.0.elapsed().as_secs() >= 60 {
            *e = (Instant::now(), 0);
        }
        if e.1 >= max {
            return Err(ApiError(
                StatusCode::TOO_MANY_REQUESTS,
                "Chậm lại một chút, thử lại sau 1 phút.",
            ));
        }
        e.1 += 1;
        Ok(())
    }
}
#[derive(Debug)]
pub struct ApiError(pub StatusCode, pub &'static str);
impl ApiError {
    fn unavailable() -> Self {
        Self(
            StatusCode::SERVICE_UNAVAILABLE,
            "Tạm thời không thể kết nối. Vui lòng thử lại.",
        )
    }
    fn gone() -> Self {
        Self(
            StatusCode::GONE,
            "Lời nhắn không còn khả dụng hoặc link không đúng.",
        )
    }
    fn bad() -> Self {
        Self(StatusCode::BAD_REQUEST, "Dữ liệu không hợp lệ.")
    }
}
impl From<sqlx::Error> for ApiError {
    fn from(_: sqlx::Error) -> Self {
        Self::unavailable()
    }
}
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(serde_json::json!({"error": self.1}))).into_response()
    }
}
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
fn hash(s: &str) -> String {
    hex::encode(Sha256::digest(s.as_bytes()))
}
fn token() -> String {
    let mut b = [0u8; 32];
    OsRng.fill_bytes(&mut b);
    URL_SAFE_NO_PAD.encode(b)
}
fn valid_token(s: &str) -> bool {
    URL_SAFE_NO_PAD.decode(s).is_ok_and(|b| b.len() == 32) && s.len() == 43
}
fn pin_hash(app: &App, id: &str, pin: &str) -> String {
    let mut mac =
        Hmac::<Sha256>::new_from_slice(app.pepper.as_bytes()).expect("HMAC accepts any length");
    mac.update(id.as_bytes());
    mac.update(b":");
    mac.update(pin.as_bytes());
    hex::encode(mac.finalize().into_bytes())
}
fn valid_pin(s: &str) -> bool {
    s.len() == 6 && s.bytes().all(|b| b.is_ascii_digit())
}
fn id_ok(s: &str) -> bool {
    valid_token(s)
}
struct Challenge {
    target: u8,
    mobile: bool,
    issued: Instant,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Verification {
    pub id: String,
    pub answer: u8,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ChallengeRequest {
    mobile: bool,
}
async fn challenge(
    State(app): State<App>,
    Json(v): Json<ChallengeRequest>,
) -> Result<impl IntoResponse, ApiError> {
    app.limit("challenge", 90)?;
    let mut map = app.challenges.lock().map_err(|_| ApiError::unavailable())?;
    map.retain(|_, c| c.issued.elapsed().as_secs() < 120);
    if map.len() >= 180 {
        return Err(ApiError::unavailable());
    }
    let id = token();
    // Rejection sampling avoids modulo bias for the 100 possible targets.
    let mut b = [0u8; 1];
    loop {
        OsRng.fill_bytes(&mut b);
        if b[0] < 200 {
            break;
        }
    }
    let target = if v.mobile { 100 } else { b[0] % 100 + 1 };
    map.insert(
        id.clone(),
        Challenge {
            target,
            mobile: v.mobile,
            issued: Instant::now(),
        },
    );
    Ok(Json(
        serde_json::json!({"id":id,"target":target,"expires_in":120}),
    ))
}
fn verify(app: &App, v: Option<Verification>) -> Result<(), ApiError> {
    let v = v.ok_or(ApiError(
        StatusCode::BAD_REQUEST,
        "Hãy kéo thanh xác nhận trước khi tạo link.",
    ))?;
    let c = app
        .challenges
        .lock()
        .map_err(|_| ApiError::unavailable())?
        .remove(&v.id)
        .ok_or(ApiError(
            StatusCode::BAD_REQUEST,
            "Xác nhận đã hết hạn. Hãy thử lại.",
        ))?;
    let elapsed = c.issued.elapsed();
    if elapsed.as_secs() >= 120
        || elapsed.as_millis() < 500
        || v.answer != c.target
        || (c.mobile && v.answer != 100)
    {
        return Err(ApiError(
            StatusCode::BAD_REQUEST,
            "Xác nhận chưa đúng. Hãy thử lại.",
        ));
    }
    Ok(())
}
async fn metadata(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(v): Json<Access>,
) -> Result<impl IntoResponse, ApiError> {
    app.limit("metadata", 180)?;
    if !id_ok(&id) || !valid_token(&v.access) {
        return Err(ApiError::gone());
    }
    let row=sqlx::query("SELECT expires_at,burn,pin_hash FROM hush_messages WHERE id=$1 AND access_hash=$2 AND expires_at>$3 AND attempts<5")
      .bind(id).bind(hash(&v.access)).bind(now()).fetch_optional(&app.pool).await?.ok_or_else(ApiError::gone)?;
    let expiry: i64 = row.try_get("expires_at")?;
    let burn: i32 = row.try_get("burn")?;
    let pin: String = row.try_get("pin_hash")?;
    Ok(Json(
        serde_json::json!({"expires_at":expiry,"burn":burn==1,"requires_pin":!pin.is_empty()}),
    ))
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Create {
    pub verification: Option<Verification>,
    pub id: Option<String>,
    pub ciphertext: String,
    pub iv: String,
    pub access: String,
    pub revoke: String,
    pub ttl: i64,
    pub burn: bool,
    pub pin: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Access {
    pub access: String,
    pub pin: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Revoke {
    pub revoke: String,
}
#[derive(Serialize)]
struct Created {
    id: String,
    expires_at: i64,
}
async fn create(
    State(app): State<App>,
    Json(v): Json<Create>,
) -> Result<impl IntoResponse, ApiError> {
    app.limit("create", 30)?;
    if !(60..=604800).contains(&v.ttl)
        || v.id.as_ref().is_some_and(|id| !valid_token(id))
        || !valid_token(&v.access)
        || !valid_token(&v.revoke)
        || v.access == v.revoke
        || v.pin.as_ref().is_some_and(|p| !valid_pin(p))
    {
        return Err(ApiError::bad());
    }
    let bytes = URL_SAFE_NO_PAD
        .decode(&v.ciphertext)
        .map_err(|_| ApiError::bad())?;
    if !(17..=2097168).contains(&bytes.len())
        || URL_SAFE_NO_PAD
            .decode(&v.iv)
            .map_err(|_| ApiError::bad())?
            .len()
            != 12
    {
        return Err(ApiError::bad());
    }
    verify(&app, v.verification)?;
    let id = v.id.unwrap_or_else(token);
    let expiry = now() + v.ttl;
    let pin = v
        .pin
        .as_deref()
        .map(|p| pin_hash(&app, &id, p))
        .unwrap_or_default();
    // A global cap bounds anonymous storage abuse. Per-process limits assume one API replica.
    let usage = sqlx::query(
        "SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(ciphertext)),0) AS total FROM hush_messages",
    )
    .fetch_one(&app.pool)
    .await?;
    let count: i64 = usage.try_get("count")?;
    let total: i64 = usage.try_get("total")?;
    if count >= 10000 || total + v.ciphertext.len() as i64 > 134217728 {
        return Err(ApiError::unavailable());
    }
    let inserted = sqlx::query("INSERT INTO hush_messages (id,ciphertext,iv,access_hash,revoke_hash,pin_hash,expires_at,burn,attempts) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0) ON CONFLICT (id) DO NOTHING")
        .bind(&id).bind(v.ciphertext).bind(v.iv).bind(hash(&v.access)).bind(hash(&v.revoke)).bind(pin).bind(expiry).bind(i32::from(v.burn)).execute(&app.pool).await?;
    if inserted.rows_affected() != 1 {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "Link đã tồn tại. Hãy tạo lại lời nhắn.",
        ));
    }
    Ok((
        StatusCode::CREATED,
        Json(Created {
            id,
            expires_at: expiry,
        }),
    ))
}
async fn open(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(v): Json<Access>,
) -> Result<impl IntoResponse, ApiError> {
    app.limit("open", 180)?;
    if !id_ok(&id) || !valid_token(&v.access) {
        return Err(ApiError::gone());
    }
    let access_hash = hash(&v.access);
    // Consume one of five PIN attempts atomically. Wrong link tokens cannot lock out real recipients.
    // The returned fields reflect the state before attempts can be exhausted by a different request.
    let row=sqlx::query("UPDATE hush_messages SET attempts=attempts+CASE WHEN pin_hash<>'' AND pin_hash<>$4 AND $5<>'' THEN 1 ELSE 0 END WHERE id=$1 AND access_hash=$2 AND expires_at>$3 AND attempts<5 RETURNING pin_hash,attempts")
        .bind(&id).bind(&access_hash).bind(now()).bind(pin_hash(&app,&id,v.pin.as_deref().unwrap_or(""))).bind(v.pin.as_deref().unwrap_or("")).fetch_optional(&app.pool).await?.ok_or_else(ApiError::gone)?;
    let expected: String = row.try_get("pin_hash")?;
    let attempts: i32 = row.try_get("attempts")?;
    if !expected.is_empty() {
        let supplied = v.pin.as_deref().unwrap_or("");
        // Constant time MAC verification rather than string comparison.
        let mut mac = Hmac::<Sha256>::new_from_slice(app.pepper.as_bytes()).expect("valid HMAC");
        mac.update(id.as_bytes());
        mac.update(b":");
        mac.update(supplied.as_bytes());
        if !valid_pin(supplied)
            || mac
                .verify_slice(&hex::decode(&expected).unwrap_or_default())
                .is_err()
        {
            if attempts >= 5 {
                sqlx::query("DELETE FROM hush_messages WHERE id=$1")
                    .bind(&id)
                    .execute(&app.pool)
                    .await?;
                return Err(ApiError::gone());
            }
            return Err(ApiError(
                StatusCode::UNAUTHORIZED,
                "Cần mã 6 số chính xác. Sau 5 lần sai, lời nhắn sẽ bị huỷ.",
            ));
        }
    }
    // DELETE ... RETURNING gives exactly one winner, including simultaneous requests.
    let row=sqlx::query("DELETE FROM hush_messages WHERE id=$1 AND access_hash=$2 AND expires_at>$3 AND burn=1 AND attempts<5 RETURNING ciphertext,iv")
        .bind(&id).bind(&access_hash).bind(now()).fetch_optional(&app.pool).await?;
    let row=match row { Some(r)=>r, None=>sqlx::query("UPDATE hush_messages SET attempts=attempts WHERE id=$1 AND access_hash=$2 AND expires_at>$3 AND burn=0 AND attempts<5 RETURNING ciphertext,iv")
        .bind(&id).bind(&access_hash).bind(now()).fetch_optional(&app.pool).await?.ok_or_else(ApiError::gone)? };
    let ciphertext: String = row.try_get("ciphertext")?;
    let iv: String = row.try_get("iv")?;
    Ok(Json(serde_json::json!({"ciphertext":ciphertext,"iv":iv})))
}
async fn revoke(
    State(app): State<App>,
    Path(id): Path<String>,
    Json(v): Json<Revoke>,
) -> Result<impl IntoResponse, ApiError> {
    app.limit("revoke", 60)?;
    if !id_ok(&id) || !valid_token(&v.revoke) {
        return Err(ApiError::gone());
    }
    sqlx::query("DELETE FROM hush_messages WHERE id=$1 AND revoke_hash=$2")
        .bind(id)
        .bind(hash(&v.revoke))
        .execute(&app.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
pub async fn cleanup(pool: &AnyPool) -> Result<u64, sqlx::Error> {
    Ok(
        sqlx::query("DELETE FROM hush_messages WHERE expires_at<=$1 OR attempts>=5")
            .bind(now())
            .execute(pool)
            .await?
            .rows_affected(),
    )
}
async fn security(State(app): State<App>, req: Request, next: Next) -> Response {
    let post = req.method() == axum::http::Method::POST;
    let valid =
        req.headers().get("origin").and_then(|v| v.to_str().ok()) == Some(app.origin.as_str());
    let mut res = if post && !valid {
        ApiError(StatusCode::FORBIDDEN, "Nguồn yêu cầu không được phép.").into_response()
    } else {
        next.run(req).await
    };
    let h = res.headers_mut();
    for (k, v) in [
        ("cache-control", "no-store, max-age=0"),
        ("pragma", "no-cache"),
        ("referrer-policy", "no-referrer"),
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
        (
            "permissions-policy",
            "camera=(), microphone=(self), geolocation=()",
        ),
        (
            "content-security-policy",
            "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; media-src blob:; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'",
        ),
    ] {
        h.insert(k, HeaderValue::from_static(v));
    }
    if app.origin.starts_with("https://") {
        h.insert(
            "strict-transport-security",
            HeaderValue::from_static("max-age=31536000"),
        );
    }
    res
}
// Civil-date conversion uses Howard Hinnant's days-to-civil algorithm (UTC only).
fn expiry_utc(epoch: i64) -> String {
    let z = epoch.div_euclid(86400) + 719468;
    let era = z.div_euclid(146097);
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let year = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = year + i64::from(month <= 2);
    let sec = epoch.rem_euclid(86400);
    format!(
        "{year:04}-{month:02}-{day:02} {:02}:{:02}:{:02} UTC",
        sec / 3600,
        sec / 60 % 60,
        sec % 60
    )
}
async fn preview(
    State(app): State<App>,
    Path(handle): Path<String>,
) -> Result<impl IntoResponse, ApiError> {
    app.limit("preview", 180)?;
    let valid = handle.len() == 16
        && handle
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-');
    let row = if valid {
        sqlx::query("SELECT burn,expires_at FROM hush_messages WHERE substr(id,1,16)=$1 AND expires_at>$2 AND attempts<5 LIMIT 1")
        .bind(&handle).bind(now()).fetch_optional(&app.pool).await?
    } else {
        None
    };
    let (title, description, kind) = if let Some(row) = row {
        let burn: i32 = row.try_get("burn")?;
        let expiry: i64 = row.try_get("expires_at")?;
        (
            if burn == 1 {
                "Whisper. — Open once"
            } else {
                "Whisper. — A private message"
            },
            format!(
                "{} Valid until {}. Encrypted content stays private.",
                if burn == 1 {
                    "Open once, then this link is gone."
                } else {
                    "Reopen until it expires."
                },
                expiry_utc(expiry)
            ),
            if burn == 1 { "once" } else { "timed" },
        )
    } else {
        (
            "Whisper. — Link unavailable",
            "This message has expired, was opened, or is no longer available.".into(),
            "gone",
        )
    };
    // No request/user text enters metadata. Origin is escaped before HTML interpolation.
    let origin = app
        .origin
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
        .replace('>', "&gt;");
    let tags = format!(
        r#"<meta name="robots" content="noindex, noarchive, nosnippet"><meta name="description" content="{description}"><meta property="og:title" content="{title}"><meta property="og:description" content="{description}"><meta property="og:type" content="website"><meta property="og:image" content="{origin}/og-{kind}.png?v=soft-w2"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image">"#
    );
    Ok(axum::response::Html(
        client_html().await.replace("</head>", &(tags + "</head>")),
    ))
}
// Vite output is loaded at runtime, so the Rust API can still compile independently.
async fn client_html() -> String {
    tokio::fs::read_to_string("dist/index.html")
        .await
        .unwrap_or_else(|_| include_str!("../web/index.html").to_owned())
}
async fn client_asset(Path(file): Path<String>) -> Response {
    // Assets are flat, public build artifacts. Never allow traversal or source maps.
    if file.contains("..")
        || file.contains('/')
        || file.contains('\\')
        || !(file.ends_with(".js") || file.ends_with(".css"))
    {
        return StatusCode::NOT_FOUND.into_response();
    }
    match tokio::fs::read(format!("dist/assets/{file}")).await {
        Ok(bytes) => (
            [(
                "content-type",
                if file.ends_with(".css") {
                    "text/css"
                } else {
                    "text/javascript"
                },
            )],
            bytes,
        )
            .into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}
async fn index() -> impl IntoResponse {
    axum::response::Html(client_html().await)
}
async fn js() -> impl IntoResponse {
    (
        [("content-type", "text/javascript; charset=utf-8")],
        include_str!("../web/app.js"),
    )
}
async fn crypto_js() -> impl IntoResponse {
    (
        [("content-type", "text/javascript; charset=utf-8")],
        include_str!("../web/crypto.js"),
    )
}
async fn css() -> impl IntoResponse {
    (
        [("content-type", "text/css; charset=utf-8")],
        include_str!("../web/style.css"),
    )
}
async fn rich_js() -> impl IntoResponse {
    (
        [("content-type", "text/javascript; charset=utf-8")],
        include_str!("../web/rich.js"),
    )
}
async fn purify_js() -> impl IntoResponse {
    (
        [("content-type", "text/javascript; charset=utf-8")],
        include_str!("../web/vendor/purify.js"),
    )
}
async fn theme_js() -> impl IntoResponse {
    (
        [("content-type", "text/javascript; charset=utf-8")],
        include_str!("../web/theme.js"),
    )
}
async fn favicon() -> impl IntoResponse {
    (
        [("content-type", "image/svg+xml")],
        include_str!("../web/whisper-mark.svg"),
    )
}
pub fn router(app: App) -> Router {
    Router::new()
        .route("/", get(index))
        .route("/assets/{*file}", get(client_asset))
        .route("/s/{handle}", get(preview))
        .route("/index.html", get(index))
        .route(
            "/editor-menu.js",
            get(|| async {
                (
                    [("content-type", "text/javascript; charset=utf-8")],
                    include_str!("../web/editor-menu.js"),
                )
            }),
        )
        .route("/m/{id}", get(index))
        .route("/revoke/{id}", get(index))
        .route("/app.js", get(js))
        .route(
            "/interactions.js",
            get(|| async {
                (
                    [("content-type", "text/javascript; charset=utf-8")],
                    include_str!("../web/interactions.js"),
                )
            }),
        )
        .route(
            "/i18n.js",
            get(|| async {
                (
                    [("content-type", "text/javascript; charset=utf-8")],
                    include_str!("../web/i18n.js"),
                )
            }),
        )
        .route(
            "/audio.js",
            get(|| async {
                (
                    [("content-type", "text/javascript; charset=utf-8")],
                    include_str!("../web/audio.js"),
                )
            }),
        )
        .route("/theme.js", get(theme_js))
        .route("/favicon.svg", get(favicon))
        .route("/crypto.js", get(crypto_js))
        .route("/rich.js", get(rich_js))
        .route(
            "/format.js",
            get(|| async {
                (
                    [("content-type", "text/javascript; charset=utf-8")],
                    include_str!("../web/format.js"),
                )
            }),
        )
        .route(
            "/marked.js",
            get(|| async {
                (
                    [("content-type", "text/javascript; charset=utf-8")],
                    include_str!("../web/vendor/marked.js"),
                )
            }),
        )
        .route("/purify.js", get(purify_js))
        .route(
            "/og-once.png",
            get(|| async {
                (
                    [("content-type", "image/png")],
                    include_bytes!("../web/og-once.png").as_slice(),
                )
            }),
        )
        .route(
            "/og-timed.png",
            get(|| async {
                (
                    [("content-type", "image/png")],
                    include_bytes!("../web/og-timed.png").as_slice(),
                )
            }),
        )
        .route(
            "/og-gone.png",
            get(|| async {
                (
                    [("content-type", "image/png")],
                    include_bytes!("../web/og-gone.png").as_slice(),
                )
            }),
        )
        .route("/style.css", get(css))
        .route("/api/challenges", post(challenge))
        .route("/api/messages", post(create))
        .route("/api/messages/{id}/metadata", post(metadata))
        .route("/api/messages/{id}/open", post(open))
        .route("/api/messages/{id}/revoke", post(revoke))
        .route(
            "/health",
            get(|| async { Json(serde_json::json!({"ok":true})) }),
        )
        .layer(DefaultBodyLimit::max(2831155))
        .layer(middleware::from_fn_with_state(app.clone(), security))
        .with_state(app)
}
pub async fn database(url: &str) -> Result<AnyPool, sqlx::Error> {
    sqlx::any::install_default_drivers();
    let pool = sqlx::any::AnyPoolOptions::new()
        .max_connections(if url.starts_with("sqlite:") { 1 } else { 5 })
        .connect(url)
        .await?;
    // Production migration is explicit. Only SQLite local mode bootstraps its schema.
    if url.starts_with("sqlite:") {
        sqlx::raw_sql(SCHEMA).execute(&pool).await?;
    }
    Ok(pool)
}

#[cfg(test)]
mod challenge_tests {
    use super::*;
    #[tokio::test]
    async fn expired_challenge_is_consumed_and_target_is_exact() {
        let app = App::new(
            database("sqlite::memory:").await.unwrap(),
            "http://localhost:8787".into(),
            "p".repeat(64),
        );
        app.challenges.lock().unwrap().insert(
            "expired".into(),
            Challenge {
                target: 42,
                mobile: false,
                issued: Instant::now() - std::time::Duration::from_secs(121),
            },
        );
        assert!(
            verify(
                &app,
                Some(Verification {
                    id: "expired".into(),
                    answer: 42
                })
            )
            .is_err()
        );
        assert!(app.challenges.lock().unwrap().is_empty());
        app.challenges.lock().unwrap().insert(
            "wrong".into(),
            Challenge {
                target: 42,
                mobile: false,
                issued: Instant::now() - std::time::Duration::from_secs(1),
            },
        );
        assert!(
            verify(
                &app,
                Some(Verification {
                    id: "wrong".into(),
                    answer: 43
                })
            )
            .is_err()
        );
        assert!(app.challenges.lock().unwrap().is_empty());
    }
}

#[cfg(test)]
mod preview_dates {
    use super::expiry_utc;
    #[test]
    fn renders_utc_and_leap_boundaries() {
        assert_eq!(expiry_utc(0), "1970-01-01 00:00:00 UTC");
        assert_eq!(expiry_utc(1794409200), "2026-11-11 15:00:00 UTC");
        assert_eq!(expiry_utc(1709164800), "2024-02-29 00:00:00 UTC");
        assert_eq!(expiry_utc(1709251200), "2024-03-01 00:00:00 UTC");
    }
}
