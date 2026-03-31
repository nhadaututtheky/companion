use std::path::PathBuf;
use std::time::Duration;

/// Resolve the path where Companion stores its database.
/// Uses the OS-standard data directory: e.g.
///   Windows: %APPDATA%\Companion\companion.db
///   macOS:   ~/Library/Application Support/Companion/companion.db
///   Linux:   ~/.local/share/Companion/companion.db
pub fn resolve_db_path() -> PathBuf {
    let base = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("Companion");

    std::fs::create_dir_all(&base).unwrap_or_else(|e| {
        log::warn!("Failed to create Companion data dir: {}", e);
    });

    base.join("companion.db")
}

/// Poll `http://localhost:3579/api/health` until a 200 is received or
/// `max_attempts` is exhausted.  Returns `true` when the server is ready.
pub async fn wait_for_server(max_attempts: u32, interval_ms: u64) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to build HTTP client: {}", e);
            return false;
        }
    };

    for attempt in 1..=max_attempts {
        match client.get("http://localhost:3579/api/health").send().await {
            Ok(resp) if resp.status().is_success() => {
                log::info!("Server ready after {} attempt(s)", attempt);
                return true;
            }
            Ok(resp) => {
                log::debug!("Health check attempt {}: HTTP {}", attempt, resp.status());
            }
            Err(e) => {
                log::debug!("Health check attempt {}: {}", attempt, e);
            }
        }

        tokio::time::sleep(Duration::from_millis(interval_ms)).await;
    }

    log::error!("Server did not become ready after {} attempts", max_attempts);
    false
}
