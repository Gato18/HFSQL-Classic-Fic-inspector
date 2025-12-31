/**
 * Handlers HTTP pour les endpoints IA.
 * 
 * Ce fichier contient les handlers HTTP pour les fonctionnalités IA,
 * notamment le conseil DB intelligent.
 * 
 * Endpoints :
 * - POST /api/ai/db-advisor : Génère des conseils DB intelligents
 * 
 * Sécurité :
 * - Mode lecture seule (ne jamais exécuter le SQL généré)
 * - Masquage des secrets dans les logs
 * - Timeouts et gestion d'erreurs robuste
 */

use crate::ai::advisor::{DbAdvisor, DbAdvisorResponse};
use crate::logger::{get_logger, LogLevel};
use anyhow::Result;
use axum::{
    http::StatusCode,
    response::Json,
};
use serde::{Deserialize, Serialize};

/// Requête pour le conseil DB
#[derive(Deserialize)]
pub struct DbAdvisorRequest {
    /// Nom du DSN ODBC
    pub dsn: String,
    /// Requête SQL optionnelle à analyser
    #[serde(default)]
    pub sql_query: Option<String>,
    /// Clé API Mistral optionnelle (si non fournie, utilise la variable d'environnement)
    #[serde(default)]
    pub mistral_api_key: Option<String>,
    /// Liste de tables optionnelle (si fournie, sera utilisée au lieu de récupérer via ODBC)
    #[serde(default)]
    pub tables: Option<Vec<String>>,
}

/// Réponse du conseil DB pour HTTP
#[derive(Serialize)]
pub struct DbAdvisorHttpResponse {
    /// Succès de l'opération
    pub success: bool,
    /// Conseils générés (sérialisé en JSON plat)
    pub advice: Option<serde_json::Value>,
    /// Message d'erreur éventuel
    pub error: Option<String>,
}

/**
 * Handler POST /api/ai/db-advisor - Génère des conseils DB intelligents.
 * 
 * Collecte le contexte d'une base de données via ODBC et génère
 * des conseils intelligents via l'API Mistral pour optimiser
 * la performance et la qualité des données.
 * 
 * @param request - Requête contenant le DSN et optionnellement une requête SQL
 * @returns Result<Json<DbAdvisorHttpResponse>> - Conseils générés ou erreur HTTP
 * 
 * Effets de bord :
 * - Se connecte à la base de données ODBC (lecture seule)
 * - Fait un appel à l'API Mistral
 * 
 * Sécurité :
 * - Ne jamais exécuter le SQL suggéré automatiquement
 * - Mode lecture seule pour les requêtes ODBC
 */
pub async fn db_advisor(
    Json(request): Json<DbAdvisorRequest>,
) -> Result<Json<DbAdvisorHttpResponse>, (StatusCode, Json<DbAdvisorHttpResponse>)> {
    get_logger().log_with_source(
        LogLevel::Info,
        format!("Requête de conseil DB pour DSN: {}", request.dsn),
        Some("AI".to_string()),
    );
    
    // Créer le conseiller DB avec la clé API fournie (ou utiliser celle de l'environnement)
    let advisor = match DbAdvisor::with_api_key(request.mistral_api_key.clone()) {
        Ok(advisor) => advisor,
        Err(e) => {
            get_logger().log_with_source(
                LogLevel::Error,
                format!("Erreur lors de la création du conseiller DB: {}", e),
                Some("AI".to_string()),
            );
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(DbAdvisorHttpResponse {
                    success: false,
                    advice: None,
                    error: Some(format!("Erreur de configuration: {}. Vérifiez que MISTRAL_API_KEY est définie ou fournie dans la requête.", e)),
                }),
            ));
        }
    };
    
    // Collecter le contexte DB (lecture seule)
    let context = match tokio::task::spawn_blocking({
        let dsn = request.dsn.clone();
        let sql_query = request.sql_query.clone();
        let tables = request.tables.clone();
        move || DbAdvisor::collect_context(&dsn, sql_query, tables)
    })
    .await
    {
        Ok(Ok(context)) => context,
        Ok(Err(e)) => {
            get_logger().log_with_source(
                LogLevel::Error,
                format!("Erreur lors de la collecte du contexte DB: {}", e),
                Some("AI".to_string()),
            );
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(DbAdvisorHttpResponse {
                    success: false,
                    advice: None,
                    error: Some(format!("Erreur lors de la collecte du contexte: {}", e)),
                }),
            ));
        }
        Err(e) => {
            get_logger().log_with_source(
                LogLevel::Error,
                format!("Erreur d'exécution lors de la collecte du contexte: {}", e),
                Some("AI".to_string()),
            );
            return Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(DbAdvisorHttpResponse {
                    success: false,
                    advice: None,
                    error: Some(format!("Erreur d'exécution: {}", e)),
                }),
            ));
        }
    };
    
    // Générer les conseils via l'API Mistral
    match advisor.generate_advice(context).await {
        Ok(advice) => {
            // Extraire le niveau de confiance selon le type de réponse
            let confidence = match &advice {
                DbAdvisorResponse::Structured { niveau_confiance, .. } => *niveau_confiance,
                DbAdvisorResponse::Raw(_) => 0.5, // Valeur par défaut pour les réponses brutes
            };
            
            get_logger().log_with_source(
                LogLevel::Info,
                format!("Conseils DB générés avec succès (confiance: {:.2}%)", 
                    confidence * 100.0),
                Some("AI".to_string()),
            );
            
            // Avertissement de sécurité dans les logs
            let has_sql = match &advice {
                DbAdvisorResponse::Structured { sql_suggere, .. } => sql_suggere.is_some(),
                DbAdvisorResponse::Raw(_) => false,
            };
            
            if has_sql {
                get_logger().log_with_source(
                    LogLevel::Warn,
                    "⚠️ SQL suggéré détecté - NE JAMAIS EXÉCUTER AUTOMATIQUEMENT".to_string(),
                    Some("AI".to_string()),
                );
            }
            
            // Convertir l'enum en JSON Value pour une sérialisation cohérente
            let advice_json = match advice {
                DbAdvisorResponse::Structured { 
                    diagnostic, 
                    actions_recommandees, 
                    risques, 
                    sql_suggere, 
                    niveau_confiance,
                    notes_complementaires 
                } => {
                    let mut json = serde_json::json!({
                        "diagnostic": diagnostic,
                        "actions_recommandees": actions_recommandees,
                        "risques": risques,
                        "niveau_confiance": niveau_confiance,
                    });
                    
                    if let Some(sql) = sql_suggere {
                        json["sql_suggere"] = sql;
                    }
                    
                    if let Some(notes) = notes_complementaires {
                        json["notes_complementaires"] = notes;
                    }
                    
                    json
                },
                DbAdvisorResponse::Raw(value) => value,
            };
            
            Ok(Json(DbAdvisorHttpResponse {
                success: true,
                advice: Some(advice_json),
                error: None,
            }))
        }
        Err(e) => {
            get_logger().log_with_source(
                LogLevel::Error,
                format!("Erreur lors de la génération des conseils: {}", e),
                Some("AI".to_string()),
            );
            Err((
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(DbAdvisorHttpResponse {
                    success: false,
                    advice: None,
                    error: Some(format!("Erreur lors de la génération des conseils: {}", e)),
                }),
            ))
        }
    }
}

