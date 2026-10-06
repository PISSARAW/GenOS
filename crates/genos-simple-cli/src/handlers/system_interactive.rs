use crate::{api_base_url, apply_api_auth, command_error, ensure_cargo_on_path};

fn strip_scheme<'a>(url: &'a str) -> &'a str {
    match url.strip_prefix("http://") {
        Some(v) => v,
        None => match url.strip_prefix("https://") {
            Some(v) => v,
            None => url,
        },
    }
}

fn host_port(clean: &str) -> String {
    match clean.split('/').next() {
        Some(v) => v.to_string(),
        None => clean.to_string(),
    }
}

fn socket_addr(api_url: &str) -> String {
    let host_part = host_port(strip_scheme(api_url));
    match host_part.contains(':') {
        true => host_part,
        false => format!("{}:{}", host_part, crate::api_port()),
    }
}

fn extract_rethink(args: &[String]) -> (bool, String) {
    let mut list = args.to_vec();
    let mut rethink = false;
    let mut pos: Option<usize> = None;
    for (i, item) in list.iter().enumerate() {
        match item == "--rethink" {
            true => {
                pos = Some(i);
                break;
            }
            false => {},
        }
    }
    match pos {
        Some(i) => {
            rethink = true;
            list.remove(i);
        }
        None => {},
    }
    (rethink, list.join(" "))
}

async fn send_ask(api_url: &str, prompt: &str, rethink: bool) {
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build() {
        Ok(v) => v,
        Err(e) => command_error(format!("client http indisponible: {}", e)),
    };
    let body = serde_json::json!({"model": "genos-core-v3", "messages": [{"role": "user", "content": prompt}]});
    let base = apply_api_auth(client.post(format!("{}/v1/chat/completions", api_url))).json(&body);
    let with_system = base.header("X-GenOS-System", "1");
    let req = match rethink {
        true => with_system.header("X-GenOS-Rethink", "true"),
        false => with_system,
    };
    match req.send().await {
        Ok(res) => report_ask_response(res).await,
        Err(err) => command_error(format!("erreur de communication: {}", err)),
    }
}

async fn report_ask_response(res: reqwest::Response) {
    match res.status().is_success() {
        false => command_error(format!("erreur HTTP du serveur: {}", res.status())),
        true => match res.json::<serde_json::Value>().await {
            Ok(json_resp) => match json_resp["choices"][0]["message"]["content"].as_str() {
                Some(text) => println!("{}", text),
                None => command_error(format!("réponse inattendue du modèle: {:?}", json_resp)),
            },
            Err(e) => command_error(format!("réponse illisible: {}", e)),
        },
    }
}

pub async fn handle_ask(args: &[String], reachable: fn(&str) -> bool) {
    match args.is_empty() {
        true => {
            println!("Usage: .\\g ask <Votre question ou problème...> [--rethink]");
            println!("Exemple : .\\g ask Quelle est la capitale du Burundi ?");
            return;
        }
        false => {},
    }
    ensure_cargo_on_path();
    let api_url = api_base_url();
    let addr = socket_addr(&api_url);
    match reachable(&addr) {
        true => {},
        false => {
            eprintln!("Le serveur GenOS n'est pas démarré sur {}.", addr);
            eprintln!("Lancez d'abord './g start' pour éveiller le cortex GenOS.");
            std::process::exit(1);
        }
    }
    let (rethink, prompt) = extract_rethink(args);
    send_ask(&api_url, &prompt, rethink).await;
}

fn read_user_line() -> Option<String> {
    use std::io::Write;
    print!("\nVous > ");
    match std::io::stdout().flush() {
        Ok(()) => {},
        Err(_) => {},
    }
    let mut line = String::new();
    match std::io::stdin().read_line(&mut line) {
        Ok(_) => {},
        Err(_) => return None,
    }
    match line.trim().is_empty() {
        true => None,
        false => Some(line.trim().to_string()),
    }
}

fn is_exit_word(trimmed: &str) -> bool {
    match trimmed.eq_ignore_ascii_case("exit") {
        true => true,
        false => trimmed.eq_ignore_ascii_case("quit"),
    }
}

pub struct ChatTurn<'a> {
    pub client: &'a reqwest::Client,
    pub api_url: &'a str,
    pub history_and_user: (&'a mut Vec<serde_json::Value>, &'a str),
}

async fn report_chat_response(res: reqwest::Response, history: &mut Vec<serde_json::Value>) {
    match res.status().is_success() {
        false => println!("(Erreur HTTP {})", res.status()),
        true => match res.json::<serde_json::Value>().await {
            Ok(json_resp) => match json_resp["choices"][0]["message"]["content"].as_str() {
                Some(text) => {
                    println!("{}", text);
                    history.push(serde_json::json!({"role": "assistant", "content": text}));
                }
                None => println!("(Réponse vide)"),
            },
            Err(_) => println!("(Réponse illisible)"),
        },
    }
}

async fn chat_turn(job: ChatTurn<'_>) {
    job.history_and_user.0.push(serde_json::json!({"role": "user", "content": job.history_and_user.1}));
    let body = serde_json::json!({"model": "genos-core-v3", "messages": job.history_and_user.0.clone()});
    print!("GenOS > ");
    match std::io::Write::flush(&mut std::io::stdout()) {
        Ok(()) => {},
        Err(_) => {},
    }
    match apply_api_auth(job.client.post(format!("{}/v1/chat/completions", job.api_url))).json(&body).send().await {
        Ok(res) => report_chat_response(res, job.history_and_user.0).await,
        Err(err) => println!("(Erreur de connexion : {})", err),
    }
}

pub async fn handle_chat(reachable: fn(&str) -> bool) {
    ensure_cargo_on_path();
    let api_url = api_base_url();
    let host = strip_scheme(&api_url).to_string();
    match reachable(&host) {
        true => {},
        false => {
            eprintln!("Le serveur GenOS n'est pas accessible ({}).", api_url);
            eprintln!("Lancez d'abord './g start' pour éveiller le cortex GenOS.");
            std::process::exit(1);
        }
    }
    println!("Session de discussion GenOS active (tapez 'exit' ou 'quit' pour quitter).");
    let client = match reqwest::Client::builder().timeout(std::time::Duration::from_secs(300)).build() {
        Ok(v) => v,
        Err(e) => command_error(format!("client http indisponible: {}", e)),
    };
    let mut history: Vec<serde_json::Value> = Vec::new();
    loop {
        match read_user_line() {
            None => {},
            Some(line) => match is_exit_word(&line) {
                true => {
                    println!("Fin de la session GenOS.");
                    break;
                }
                false => chat_turn(ChatTurn { client: &client, api_url: &api_url, history_and_user: (&mut history, &line) }).await,
            },
        }
    }
}
