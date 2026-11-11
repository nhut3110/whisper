use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::AnyPool;
use tower::ServiceExt;
use whisper::{App, SCHEMA, cleanup, database, now, router};
static PG_SCHEMA: tokio::sync::OnceCell<()> = tokio::sync::OnceCell::const_new();
const ORIGIN: &str = "http://localhost:8787";
fn tok(b: u8) -> String {
    B64.encode([b; 32])
}
async fn setup() -> (Router, AnyPool) {
    let url = std::env::var("TEST_DATABASE_URL").unwrap_or("sqlite::memory:".into());
    let pool = database(&url).await.unwrap();
    if url.starts_with("postgres") {
        PG_SCHEMA
            .get_or_init(|| async {
                sqlx::raw_sql(SCHEMA).execute(&pool).await.unwrap();
            })
            .await;
    }
    (
        router(App::new(pool.clone(), ORIGIN.into(), "p".repeat(64))),
        pool,
    )
}
fn payload() -> Value {
    json!({"ciphertext":B64.encode([7;48]),"iv":B64.encode([3;12]),"access":tok(1),"revoke":tok(2),"ttl":3600,"burn":true,"pin":null})
}
async fn call(app: &Router, method: &str, path: &str, data: Value) -> (StatusCode, Value) {
    let req = Request::builder()
        .method(method)
        .uri(path)
        .header("origin", ORIGIN)
        .header("content-type", "application/json")
        .body(if method == "GET" {
            Body::empty()
        } else {
            Body::from(data.to_string())
        })
        .unwrap();
    let res = app.clone().oneshot(req).await.unwrap();
    let status = res.status();
    assert_eq!(res.headers()["cache-control"], "no-store, max-age=0");
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}
async fn verified(app: &Router, mut p: Value) -> Value {
    let (s, c) = call(app, "POST", "/api/challenges", json!({"mobile":false})).await;
    assert_eq!(s, StatusCode::OK);
    tokio::time::sleep(std::time::Duration::from_millis(510)).await;
    p["verification"] = json!({"id":c["id"],"answer":c["target"]});
    p
}
async fn make(app: &Router, p: Value) -> String {
    let p = verified(app, p).await;
    let (s, v) = call(app, "POST", "/api/messages", p).await;
    assert_eq!(s, StatusCode::CREATED, "{v}");
    v["id"].as_str().unwrap().into()
}
async fn open(app: &Router, id: &str, pin: Value) -> (StatusCode, Value) {
    call(
        app,
        "POST",
        &format!("/api/messages/{id}/open"),
        json!({"access":tok(1),"pin":pin}),
    )
    .await
}
#[tokio::test]
async fn burn_once_and_row_deleted() {
    let (a, p) = setup().await;
    let id = make(&a, payload()).await;
    let (s, v) = open(&a, &id, Value::Null).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(v["ciphertext"], payload()["ciphertext"]);
    assert_eq!(open(&a, &id, Value::Null).await.0, StatusCode::GONE);
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hush_messages WHERE id=$1")
        .bind(id)
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(n, 0);
}
#[tokio::test]
async fn preview_does_not_consume() {
    let (a, _) = setup().await;
    let id = make(&a, payload()).await;
    assert_eq!(
        call(&a, "GET", &format!("/m/{id}"), Value::Null).await.0,
        StatusCode::OK
    );
    assert_eq!(open(&a, &id, Value::Null).await.0, StatusCode::OK);
}
#[tokio::test]
async fn simultaneous_only_one_winner() {
    let (a, _) = setup().await;
    let id = make(&a, payload()).await;
    let mut jobs = vec![];
    for _ in 0..12 {
        let a = a.clone();
        let id = id.clone();
        jobs.push(tokio::spawn(
            async move { open(&a, &id, Value::Null).await.0 },
        ));
    }
    let mut winners = 0;
    for j in jobs {
        let s = j.await.unwrap();
        assert!(s == StatusCode::OK || s == StatusCode::GONE, "{s}");
        winners += usize::from(s == StatusCode::OK);
    }
    assert_eq!(winners, 1);
}
#[tokio::test]
async fn timed_read_reusable_until_expiry() {
    let (a, p) = setup().await;
    let mut v = payload();
    v["burn"] = false.into();
    let id = make(&a, v).await;
    for _ in 0..8 {
        assert_eq!(open(&a, &id, Value::Null).await.0, StatusCode::OK);
    }
    sqlx::query("UPDATE hush_messages SET expires_at=$1 WHERE id=$2")
        .bind(now() - 1)
        .bind(&id)
        .execute(&p)
        .await
        .unwrap();
    assert_eq!(open(&a, &id, Value::Null).await.0, StatusCode::GONE);
    assert!(cleanup(&p).await.unwrap() >= 1);
}
#[tokio::test]
async fn pin_missing_wrong_and_correct() {
    let (a, _) = setup().await;
    let mut v = payload();
    v["pin"] = "123456".into();
    let id = make(&a, v).await;
    for _ in 0..7 {
        assert_eq!(open(&a, &id, Value::Null).await.0, StatusCode::UNAUTHORIZED);
    }
    assert_eq!(
        open(&a, &id, json!("000000")).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(open(&a, &id, json!("123456")).await.0, StatusCode::OK);
}
#[tokio::test]
async fn fifth_wrong_pin_destroys() {
    let (a, p) = setup().await;
    let mut v = payload();
    v["pin"] = "123456".into();
    let id = make(&a, v).await;
    for _ in 0..4 {
        assert_eq!(
            open(&a, &id, json!("000000")).await.0,
            StatusCode::UNAUTHORIZED
        );
    }
    assert_eq!(open(&a, &id, json!("000000")).await.0, StatusCode::GONE);
    assert_eq!(open(&a, &id, json!("123456")).await.0, StatusCode::GONE);
    let n: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hush_messages WHERE id=$1")
        .bind(id)
        .fetch_one(&p)
        .await
        .unwrap();
    assert_eq!(n, 0);
}
#[tokio::test]
async fn malformed_pin_is_rejected() {
    let (a, _) = setup().await;
    let mut v = payload();
    v["pin"] = "123456".into();
    let id = make(&a, v).await;
    assert_eq!(
        open(&a, &id, json!("abcdef")).await.0,
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(open(&a, &id, json!("123456")).await.0, StatusCode::OK);
}
#[tokio::test]
async fn wrong_access_cannot_read_or_lock_out() {
    let (a, _) = setup().await;
    let id = make(&a, payload()).await;
    for _ in 0..6 {
        assert_eq!(
            call(
                &a,
                "POST",
                &format!("/api/messages/{id}/open"),
                json!({"access":tok(9)})
            )
            .await
            .0,
            StatusCode::GONE
        );
    }
    assert_eq!(open(&a, &id, Value::Null).await.0, StatusCode::OK);
}
#[tokio::test]
async fn revoke_requires_separate_secret() {
    let (a, _) = setup().await;
    let mut v = payload();
    v["burn"] = false.into();
    let id = make(&a, v).await;
    let path = format!("/api/messages/{id}/revoke");
    assert_eq!(
        call(&a, "POST", &path, json!({"revoke":tok(1)})).await.0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(open(&a, &id, Value::Null).await.0, StatusCode::OK);
    assert_eq!(
        call(&a, "POST", &path, json!({"revoke":tok(2)})).await.0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(open(&a, &id, Value::Null).await.0, StatusCode::GONE);
}
#[tokio::test]
async fn expires_without_open() {
    let (a, p) = setup().await;
    let id = make(&a, payload()).await;
    sqlx::query("UPDATE hush_messages SET expires_at=$1 WHERE id=$2")
        .bind(now() - 1)
        .bind(&id)
        .execute(&p)
        .await
        .unwrap();
    assert_eq!(open(&a, &id, Value::Null).await.0, StatusCode::GONE);
    cleanup(&p).await.unwrap();
}
#[tokio::test]
async fn storage_contains_only_ciphertext_and_hashes() {
    let (a, p) = setup().await;
    let mut v = payload();
    v["pin"] = "123456".into();
    let id = make(&a, v).await;
    let row: (String, String, String, String) = sqlx::query_as(
        "SELECT access_hash,revoke_hash,pin_hash,ciphertext FROM hush_messages WHERE id=$1",
    )
    .bind(id)
    .fetch_one(&p)
    .await
    .unwrap();
    assert_ne!(row.0, tok(1));
    assert_ne!(row.1, tok(2));
    assert_ne!(row.2, "123456");
    assert_eq!(row.2.len(), 64);
    assert_eq!(row.3, payload()["ciphertext"].as_str().unwrap());
}
#[tokio::test]
async fn invalid_creation_input() {
    let (a, _) = setup().await;
    for (field, val) in [
        ("ttl", json!(0)),
        ("ttl", json!(604801)),
        ("pin", json!("12345")),
        ("pin", json!("１２３４５６")),
        ("access", json!("bad")),
        ("revoke", json!(tok(1))),
        ("iv", json!("AA")),
        ("ciphertext", json!("!")),
        ("ciphertext", json!("AA")),
        ("ciphertext", json!(B64.encode(vec![1; 2097169]))),
    ] {
        let mut v = payload();
        v[field] = val;
        assert_eq!(
            call(&a, "POST", "/api/messages", v).await.0,
            StatusCode::BAD_REQUEST,
            "{field}"
        );
    }
}
#[tokio::test]
async fn invalid_path_and_token() {
    let (a, _) = setup().await;
    assert_eq!(open(&a, "bad", Value::Null).await.0, StatusCode::GONE);
    assert_eq!(
        call(
            &a,
            "POST",
            &format!("/api/messages/{}/revoke", tok(8)),
            json!({"revoke":"bad"})
        )
        .await
        .0,
        StatusCode::GONE
    );
    assert_eq!(
        call(
            &a,
            "POST",
            &format!("/api/messages/{}/open", tok(8)),
            json!({"access":"bad"})
        )
        .await
        .0,
        StatusCode::GONE
    );
}
#[tokio::test]
async fn unknown_fields_and_body_limit() {
    let (a, _) = setup().await;
    let mut v = payload();
    v["plaintext"] = json!("never allowed");
    assert_eq!(
        call(&a, "POST", "/api/messages", v).await.0,
        StatusCode::UNPROCESSABLE_ENTITY
    );
    let mut v = payload();
    v["ciphertext"] = json!("A".repeat(2831156));
    assert_eq!(
        call(&a, "POST", "/api/messages", v).await.0,
        StatusCode::PAYLOAD_TOO_LARGE
    );
}
#[tokio::test]
async fn csrf_and_missing_origin_denied() {
    let (a, _) = setup().await;
    for origin in [None, Some("https://evil.example")] {
        let mut r = Request::builder()
            .method("POST")
            .uri("/api/messages")
            .header("content-type", "application/json");
        if let Some(o) = origin {
            r = r.header("origin", o);
        }
        let res = a
            .clone()
            .oneshot(r.body(Body::from(payload().to_string())).unwrap())
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::FORBIDDEN);
    }
}
#[tokio::test]
async fn security_headers_and_assets() {
    let (a, _) = setup().await;
    for path in [
        "/",
        "/app.js",
        "/interactions.js",
        "/audio.js",
        "/i18n.js",
        "/theme.js",
        "/favicon.svg",
        "/crypto.js",
        "/rich.js",
        "/format.js",
        "/marked.js",
        "/purify.js",
        "/style.css",
        "/editor-menu.js",
        "/index.html",
        "/og-once.png",
        "/og-timed.png",
        "/og-gone.png",
        "/health",
    ] {
        let r = a
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(r.status(), StatusCode::OK);
        assert_eq!(r.headers()["x-frame-options"], "DENY");
        assert_eq!(r.headers()["referrer-policy"], "no-referrer");
        assert!(
            r.headers()["content-security-policy"]
                .to_str()
                .unwrap()
                .contains("frame-ancestors 'none'")
        );
    }
}
#[tokio::test]
async fn rate_limits_creation() {
    let (a, _) = setup().await;
    for _ in 0..30 {
        make(&a, payload()).await;
    }
    assert_eq!(
        call(&a, "POST", "/api/messages", payload()).await.0,
        StatusCode::TOO_MANY_REQUESTS
    );
}
#[tokio::test]
async fn database_failure_is_generic() {
    let (a, p) = setup().await;
    p.close().await;
    let pld = verified(&a, payload()).await;
    let (s, v) = call(&a, "POST", "/api/messages", pld).await;
    assert_eq!(s, StatusCode::SERVICE_UNAVAILABLE);
    assert!(!v.to_string().contains("sql"));
}

#[tokio::test]
async fn timed_correct_pin_does_not_reset_wrong_attempt_budget() {
    let (a, _) = setup().await;
    let mut v = payload();
    v["pin"] = json!("123456");
    v["burn"] = json!(false);
    let id = make(&a, v).await;
    for _ in 0..4 {
        assert_eq!(
            open(&a, &id, json!("000000")).await.0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(open(&a, &id, json!("123456")).await.0, StatusCode::OK);
    }
    assert_eq!(open(&a, &id, json!("000000")).await.0, StatusCode::GONE);
}
#[tokio::test]
async fn https_deployment_sets_hsts() {
    let (_, pool) = setup().await;
    let a = router(App::new(
        pool,
        "https://hush.example".into(),
        "p".repeat(64),
    ));
    let r = a
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(r.headers()["strict-transport-security"], "max-age=31536000");
}

#[tokio::test]
async fn client_derived_id_is_validated_and_cannot_overwrite_existing_message() {
    let (a, _) = setup().await;
    let mut v = payload();
    v["id"] = json!("not-valid");
    assert_eq!(
        call(&a, "POST", "/api/messages", v.clone()).await.0,
        StatusCode::BAD_REQUEST
    );
    // Fresh random ID avoids collisions between concurrent PostgreSQL test runs.
    let mut id_bytes = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut id_bytes);
    let id = B64.encode(id_bytes);
    v["id"] = json!(id);
    assert_eq!(make(&a, v.clone()).await, id);
    v["ciphertext"] = json!(B64.encode([8; 48]));
    assert_eq!(
        call(&a, "POST", "/api/messages", verified(&a, v).await)
            .await
            .0,
        StatusCode::CONFLICT
    );
    let (s, body) = open(&a, &id, Value::Null).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(body["ciphertext"], payload()["ciphertext"]);
}

#[tokio::test]
async fn challenge_missing_wrong_fast_and_replay_are_rejected() {
    let (a, _) = setup().await;
    assert_eq!(
        call(&a, "POST", "/api/messages", payload()).await.0,
        StatusCode::BAD_REQUEST
    );
    let (_, c) = call(&a, "POST", "/api/challenges", json!({"mobile":false})).await;
    assert!((1..=100).contains(&c["target"].as_u64().unwrap()));
    let mut p = payload();
    p["verification"] = json!({"id":c["id"],"answer":c["target"]});
    assert_eq!(
        call(&a, "POST", "/api/messages", p.clone()).await.0,
        StatusCode::BAD_REQUEST
    );
    tokio::time::sleep(std::time::Duration::from_millis(510)).await;
    assert_eq!(
        call(&a, "POST", "/api/messages", p).await.0,
        StatusCode::BAD_REQUEST
    );
    let mut wrong = verified(&a, payload()).await;
    wrong["verification"]["answer"] = json!(0);
    assert_eq!(
        call(&a, "POST", "/api/messages", wrong).await.0,
        StatusCode::BAD_REQUEST
    );
    let p = verified(&a, payload()).await;
    assert_eq!(
        call(&a, "POST", "/api/messages", p.clone()).await.0,
        StatusCode::CREATED
    );
    assert_eq!(
        call(&a, "POST", "/api/messages", p).await.0,
        StatusCode::BAD_REQUEST
    );
}
#[tokio::test]
async fn mobile_challenge_and_non_consuming_authenticated_metadata() {
    let (a, _) = setup().await;
    let (_, c) = call(&a, "POST", "/api/challenges", json!({"mobile":true})).await;
    assert_eq!(c["target"], 100);
    tokio::time::sleep(std::time::Duration::from_millis(510)).await;
    let mut p = payload();
    p["verification"] = json!({"id":c["id"],"answer":100});
    p["pin"] = json!("123456");
    let (_, created) = call(&a, "POST", "/api/messages", p).await;
    let id = created["id"].as_str().unwrap();
    let path = format!("/api/messages/{id}/metadata");
    for _ in 0..6 {
        let (s, m) = call(&a, "POST", &path, json!({"access":tok(1)})).await;
        assert_eq!(s, StatusCode::OK);
        assert_eq!(m["burn"], true);
        assert_eq!(m["requires_pin"], true);
        assert!(m.get("ciphertext").is_none());
    }
    assert_eq!(
        call(&a, "POST", &path, json!({"access":tok(9)})).await.0,
        StatusCode::GONE
    );
    assert_eq!(
        call(
            &a,
            "POST",
            "/api/messages/bad/metadata",
            json!({"access":"bad"})
        )
        .await
        .0,
        StatusCode::GONE
    );
    assert_eq!(open(&a, id, json!("123456")).await.0, StatusCode::OK);
    assert_eq!(
        call(&a, "POST", &path, json!({"access":tok(1)})).await.0,
        StatusCode::GONE
    );
}

#[tokio::test]
async fn audio_sized_ciphertext_at_limit_is_accepted_without_exposing_type() {
    let (a, _) = setup().await;
    let mut p = payload();
    p["ciphertext"] = json!(B64.encode(vec![7; 2097168]));
    let id = make(&a, p.clone()).await;
    let (s, data) = open(&a, &id, Value::Null).await;
    assert_eq!(s, StatusCode::OK);
    assert_eq!(data["ciphertext"], p["ciphertext"]);
    assert!(data.get("mime").is_none());
}

#[tokio::test]
async fn public_share_preview_only_exposes_policy_and_does_not_consume() {
    let (a, _) = setup().await;
    for burn in [true, false] {
        let mut p = payload();
        p["burn"] = json!(burn);
        let id = make(&a, p).await;
        let path = format!("/s/{}", &id[..16]);
        for _ in 0..2 {
            let response = a
                .clone()
                .oneshot(Request::builder().uri(&path).body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            let html = String::from_utf8(
                response
                    .into_body()
                    .collect()
                    .await
                    .unwrap()
                    .to_bytes()
                    .to_vec(),
            )
            .unwrap();
            assert!(html.contains(if burn { "og-once.png" } else { "og-timed.png" }));
            assert!(html.contains("UTC"));
            assert!(!html.contains(&tok(1)));
            assert!(!html.contains(&payload()["ciphertext"].as_str().unwrap().to_string()));
        }
        assert_eq!(open(&a, &id, Value::Null).await.0, StatusCode::OK);
    }
    for path in ["/s/malformed", "/s/AAAAAAAAAAAAAAAA"] {
        let response = a
            .clone()
            .oneshot(Request::builder().uri(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        let html = String::from_utf8(
            response
                .into_body()
                .collect()
                .await
                .unwrap()
                .to_bytes()
                .to_vec(),
        )
        .unwrap();
        assert!(html.contains("og-gone.png"));
    }
}
