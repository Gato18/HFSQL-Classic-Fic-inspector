/**
 * Client pour l'API Mistral.
 * 
 * Ce module gère la communication avec l'API Mistral pour générer
 * des conseils intelligents sur la gestion de bases de données.
 * 
 * Fonctionnalités :
 * - Appels API avec gestion des erreurs et timeouts
 * - Configuration via variables d'environnement
 * - Masquage des secrets dans les logs
 */

use crate::logger::{get_logger, LogLevel};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// Client pour l'API Mistral
pub struct MistralClient {
    api_key: String,
    api_url: String,
    timeout: Duration,
}

/// Requête à l'API Mistral
#[derive(Serialize)]
struct MistralRequest {
    model: String,
    messages: Vec<MistralMessage>,
    temperature: f32,
    max_tokens: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    stream: Option<bool>,
}

#[derive(Serialize)]
struct MistralMessage {
    role: String,
    content: String,
}

/// Réponse de l'API Mistral
#[derive(Deserialize)]
struct MistralResponse {
    choices: Vec<MistralChoice>,
}

#[derive(Deserialize)]
struct MistralChoice {
    #[serde(default)]
    message: Option<MistralMessageResponse>,
    #[serde(default)]
    delta: Option<MistralMessageResponse>,
    #[serde(default)]
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Deserialize)]
struct MistralMessageResponse {
    #[serde(default)]
    content: String,
    #[serde(default)]
    #[allow(dead_code)]
    role: Option<String>,
}

/// Événement de streaming Mistral
#[derive(Deserialize)]
struct MistralStreamEvent {
    choices: Vec<MistralChoice>,
    #[serde(default)]
    #[allow(dead_code)]
    id: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    object: Option<String>,
}

impl MistralClient {
    /**
     * Crée un nouveau client Mistral.
     * 
     * Récupère la clé API depuis la variable d'environnement MISTRAL_API_KEY.
     * Utilise l'URL par défaut de l'API Mistral si MISTRAL_API_URL n'est pas définie.
     * 
     * @returns Result<MistralClient> - Client créé ou erreur
     */
    pub fn new() -> Result<Self> {
        Self::with_api_key(None)
    }

    /**
     * Crée un nouveau client Mistral avec une clé API spécifique.
     * 
     * Si api_key est None, récupère la clé depuis la variable d'environnement MISTRAL_API_KEY.
     * Utilise l'URL par défaut de l'API Mistral si MISTRAL_API_URL n'est pas définie.
     * 
     * @param api_key - Clé API Mistral optionnelle (si None, utilise la variable d'environnement)
     * @returns Result<MistralClient> - Client créé ou erreur
     */
    pub fn with_api_key(api_key: Option<String>) -> Result<Self> {
        let api_key = match api_key {
            Some(key) if !key.trim().is_empty() => key,
            _ => std::env::var("MISTRAL_API_KEY")
                .context("Variable d'environnement MISTRAL_API_KEY non définie et aucune clé API fournie. Veuillez définir votre clé API Mistral.")?,
        };
        
        let api_url = std::env::var("MISTRAL_API_URL")
            .unwrap_or_else(|_| "https://api.mistral.ai/v1/chat/completions".to_string());
        
        // Masquer la clé API dans les logs (afficher seulement les 4 derniers caractères)
        let masked_key = if api_key.len() > 4 {
            format!("...{}", &api_key[api_key.len() - 4..])
        } else {
            "****".to_string()
        };
        
        get_logger().log_with_source(
            LogLevel::Info,
            format!("Client Mistral initialisé (API Key: {})", masked_key),
            Some("AI".to_string()),
        );
        
        Ok(Self {
            api_key,
            api_url,
            timeout: Duration::from_secs(120), // Timeout de 120 secondes (2 minutes) pour les requêtes IA
        })
    }
    
    /**
     * Génère une réponse à partir d'un prompt.
     * 
     * Envoie une requête à l'API Mistral avec le prompt fourni et retourne
     * la réponse générée. Gère les timeouts et les erreurs.
     * 
     * @param prompt - Prompt à envoyer à l'API
     * @returns Result<String> - Réponse générée ou erreur
     * 
     * Effets de bord :
     * - Fait un appel HTTP à l'API Mistral
     */
    pub async fn generate(&self, prompt: String) -> Result<String> {
        let client = reqwest::Client::builder()
            .timeout(self.timeout)
            .build()
            .context("Impossible de créer le client HTTP")?;
        
        let request = MistralRequest {
            model: "mistral-medium".to_string(), // Modèle par défaut
            messages: vec![
                MistralMessage {
                    role: "user".to_string(),
                    content: prompt,
                }
            ],
            temperature: 0.7,
            max_tokens: 2000,
            stream: None,
        };
        
        get_logger().log_with_source(
            LogLevel::Debug,
            "Envoi de la requête à l'API Mistral".to_string(),
            Some("AI".to_string()),
        );
        
        let response = client
            .post(&self.api_url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .context("Erreur lors de l'envoi de la requête à l'API Mistral")?;
        
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Erreur inconnue".to_string());
            
            get_logger().log_with_source(
                LogLevel::Error,
                format!("Erreur API Mistral ({}): {}", status, error_text),
                Some("AI".to_string()),
            );
            
            return Err(anyhow::anyhow!(
                "Erreur API Mistral ({}): {}",
                status,
                error_text
            ));
        }
        
        let mistral_response: MistralResponse = response
            .json()
            .await
            .context("Impossible de parser la réponse de l'API Mistral")?;
        
        if mistral_response.choices.is_empty() {
            return Err(anyhow::anyhow!("Aucune réponse de l'API Mistral"));
        }
        
        let content = mistral_response.choices[0]
            .message
            .as_ref()
            .map(|m| m.content.clone())
            .unwrap_or_default();
        
        get_logger().log_with_source(
            LogLevel::Debug,
            format!("Réponse reçue de l'API Mistral ({} caractères)", content.len()),
            Some("AI".to_string()),
        );
        
        Ok(content)
    }

    /**
     * Génère une réponse en streaming avec support du thinking.
     * 
     * Envoie une requête à l'API Mistral avec streaming activé et retourne
     * la réponse complète accumulée. Supporte les tokens de thinking si disponibles.
     * 
     * @param prompt - Prompt à envoyer à l'API
     * @returns Result<String> - Réponse complète générée ou erreur
     * 
     * Effets de bord :
     * - Fait un appel HTTP streaming à l'API Mistral
     */
    pub async fn generate_stream(&self, prompt: String) -> Result<String> {
        use futures::StreamExt;
        
        // Cloner le prompt pour le fallback avant de l'utiliser
        let prompt_clone = prompt.clone();
        
        // Timeout plus long pour le streaming (5 minutes)
        let stream_timeout = Duration::from_secs(300);
        
        let client = reqwest::Client::builder()
            .timeout(stream_timeout)
            .build()
            .context("Impossible de créer le client HTTP")?;
        
        let request = MistralRequest {
            model: "mistral-medium".to_string(),
            messages: vec![
                MistralMessage {
                    role: "user".to_string(),
                    content: prompt,
                }
            ],
            temperature: 0.7,
            max_tokens: 3000, // Réduire légèrement pour accélérer
            stream: Some(true),
        };
        
        get_logger().log_with_source(
            LogLevel::Debug,
            "Envoi de la requête streaming à l'API Mistral".to_string(),
            Some("AI".to_string()),
        );
        
        let response = client
            .post(&self.api_url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&request)
            .send()
            .await
            .context("Erreur lors de l'envoi de la requête à l'API Mistral")?;
        
        if !response.status().is_success() {
            let status = response.status();
            let error_text = response.text().await.unwrap_or_else(|_| "Erreur inconnue".to_string());
            
            get_logger().log_with_source(
                LogLevel::Error,
                format!("Erreur API Mistral ({}): {}", status, error_text),
                Some("AI".to_string()),
            );
            
            return Err(anyhow::anyhow!(
                "Erreur API Mistral ({}): {}",
                status,
                error_text
            ));
        }
        
        let mut stream = response.bytes_stream();
        let mut full_content = String::new();
        let mut buffer = String::new();
        let mut chunk_count = 0;
        
        while let Some(chunk_result) = stream.next().await {
            chunk_count += 1;
            let chunk = chunk_result.context("Erreur de lecture du stream")?;
            let text = String::from_utf8_lossy(&chunk);
            
            buffer.push_str(&text);
            
            // Parser les lignes SSE - traiter toutes les lignes complètes
            let last_line_incomplete = !buffer.ends_with('\n') && !buffer.ends_with('\r');
            
            // Extraire les lignes complètes
            let mut lines: Vec<String> = buffer.lines().map(|s| s.to_string()).collect();
            
            // Garder la dernière ligne incomplète dans le buffer
            let last_line = if last_line_incomplete && !lines.is_empty() {
                let last = lines.pop().unwrap();
                buffer = last.clone();
                Some(last)
            } else {
                buffer.clear();
                None
            };
            
            // Traiter toutes les lignes complètes
            for line in lines {
                let line = line.trim();
                if line.is_empty() {
                    continue;
                }
                
                if line.starts_with("data: ") {
                    let data = line[6..].trim();
                    if data == "[DONE]" {
                        continue;
                    }
                    
                    if data.is_empty() {
                        continue;
                    }
                    
                    // Essayer de parser l'événement JSON
                    match serde_json::from_str::<MistralStreamEvent>(data) {
                        Ok(event) => {
                            for choice in event.choices {
                                // Vérifier d'abord le delta (pour le streaming)
                                if let Some(delta) = choice.delta {
                                    if !delta.content.is_empty() {
                                        full_content.push_str(&delta.content);
                                    }
                                }
                                // Sinon vérifier le message (pour les réponses complètes)
                                else if let Some(message) = choice.message {
                                    if !message.content.is_empty() {
                                        full_content.push_str(&message.content);
                                    }
                                }
                            }
                        },
                        Err(_e) => {
                            // Ignorer les erreurs de parsing JSON silencieusement
                            // (peut être du texte brut ou des événements partiels)
                        }
                    }
                }
            }
            
            // Si on a une dernière ligne incomplète, la remettre dans le buffer
            if let Some(last) = last_line {
                buffer = last;
            }
        }
        
        // Traiter le buffer final s'il reste quelque chose
        if !buffer.trim().is_empty() {
            let line = buffer.trim();
            if line.starts_with("data: ") {
                let data = line[6..].trim();
                if data != "[DONE]" && !data.is_empty() {
                    if let Ok(event) = serde_json::from_str::<MistralStreamEvent>(data) {
                        for choice in event.choices {
                            if let Some(delta) = choice.delta {
                                if !delta.content.is_empty() {
                                    full_content.push_str(&delta.content);
                                }
                            } else if let Some(message) = choice.message {
                                if !message.content.is_empty() {
                                    full_content.push_str(&message.content);
                                }
                            }
                        }
                    }
                }
            }
        }
        
        get_logger().log_with_source(
            LogLevel::Info,
            format!("Réponse streaming reçue de l'API Mistral ({} caractères, {} chunks)", full_content.len(), chunk_count),
            Some("AI".to_string()),
        );
        
        // Si le contenu est vide après le streaming, essayer la méthode non-streaming
        if full_content.is_empty() {
            get_logger().log_with_source(
                LogLevel::Warn,
                "Streaming retourné 0 caractères, fallback sur méthode non-streaming".to_string(),
                Some("AI".to_string()),
            );
            return self.generate(prompt_clone).await;
        }
        
        Ok(full_content)
    }
}

