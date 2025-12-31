/**
 * Conseiller DB intelligent.
 * 
 * Ce module collecte le contexte d'une base de données (schéma, index, stats)
 * et génère des conseils intelligents via l'API Mistral pour optimiser
 * la performance et la qualité des données.
 * 
 * Fonctionnalités :
 * - Collecte du contexte DB (schéma, index, statistiques)
 * - Diagnostic de performance
 * - Analyse de qualité des données
 * - Recommandations d'optimisation
 */

use crate::ai::client::MistralClient;
use crate::logger::{get_logger, LogLevel};
use crate::sql::odbc;
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Contexte de base de données collecté pour l'analyse
#[derive(Debug, Clone, Serialize)]
pub struct DbContext {
    /// Nom du DSN ou source de données
    pub dsn: String,
    /// Liste des tables
    pub tables: Vec<String>,
    /// Schéma des tables (nom -> colonnes)
    pub schemas: HashMap<String, Vec<ColumnInfo>>,
    /// Index existants
    pub indexes: HashMap<String, Vec<IndexInfo>>,
    /// Relations entre tables
    pub relations: Vec<odbc::TableRelation>,
    /// Requête SQL optionnelle à analyser
    pub sql_query: Option<String>,
    /// Statistiques de performance (si disponibles)
    pub stats: Option<DbStats>,
}

/// Informations sur une colonne
#[derive(Debug, Clone, Serialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub nullable: Option<bool>,
    pub is_primary_key: bool,
    pub is_foreign_key: bool,
}

/// Informations sur un index
#[derive(Debug, Clone, Serialize)]
pub struct IndexInfo {
    pub name: String,
    pub columns: Vec<String>,
    pub unique: bool,
}

/// Statistiques de base de données
#[derive(Debug, Clone, Serialize)]
pub struct DbStats {
    /// Nombre total de tables
    pub table_count: usize,
    /// Nombre total d'index
    pub index_count: usize,
    /// Taille estimée de la base (si disponible)
    pub estimated_size: Option<String>,
}

/// Résultat du conseil DB - Structure flexible pour accepter différents formats JSON
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum DbAdvisorResponse {
    /// Format structuré avec champs nommés
    Structured {
        /// Diagnostic de la base de données
        diagnostic: serde_json::Value,
        /// Actions recommandées
        actions_recommandees: serde_json::Value,
        /// Risques identifiés
        risques: serde_json::Value,
        /// SQL suggéré (optionnel)
        sql_suggere: Option<serde_json::Value>,
        /// Niveau de confiance (0.0 à 1.0)
        niveau_confiance: f32,
        /// Notes complémentaires (optionnel)
        #[serde(default)]
        notes_complementaires: Option<serde_json::Value>,
    },
    /// Format brut JSON (fallback)
    Raw(serde_json::Value),
}

/// Conseiller DB intelligent
pub struct DbAdvisor {
    client: MistralClient,
}

impl DbAdvisor {
    /**
     * Crée un nouveau conseiller DB.
     * 
     * @returns Result<DbAdvisor> - Conseiller créé ou erreur
     */
    pub fn new() -> Result<Self> {
        Self::with_api_key(None)
    }

    /**
     * Crée un nouveau conseiller DB avec une clé API spécifique.
     * 
     * @param api_key - Clé API Mistral optionnelle (si None, utilise la variable d'environnement)
     * @returns Result<DbAdvisor> - Conseiller créé ou erreur
     */
    pub fn with_api_key(api_key: Option<String>) -> Result<Self> {
        let client = MistralClient::with_api_key(api_key)?;
        Ok(Self { client })
    }
    
    /**
     * Collecte le contexte d'une base de données via ODBC.
     * 
     * Récupère le schéma, les index, les relations et les statistiques
     * d'une base de données via ODBC.
     * 
     * @param dsn - Nom du DSN ODBC
     * @param sql_query - Requête SQL optionnelle à analyser
     * @param provided_tables - Liste de tables optionnelle (si fournie, sera utilisée au lieu de récupérer via ODBC)
     * @returns Result<DbContext> - Contexte collecté ou erreur
     * 
     * Effets de bord :
     * - Se connecte à la base de données ODBC
     * - Interroge les métadonnées de la base de données
     */
    pub fn collect_context(dsn: &str, sql_query: Option<String>, provided_tables: Option<Vec<String>>) -> Result<DbContext> {
        get_logger().log_with_source(
            LogLevel::Info,
            format!("Collecte du contexte DB pour DSN: {}", dsn),
            Some("AI".to_string()),
        );
        
        // Récupérer les tables (utiliser celles fournies si disponibles, sinon via ODBC)
        let tables = if let Some(provided) = provided_tables {
            get_logger().log_with_source(
                LogLevel::Info,
                format!("Utilisation de {} table(s) fournie(s) par le frontend", provided.len()),
                Some("AI".to_string()),
            );
            provided
        } else {
            odbc::get_tables(dsn)
                .context("Impossible de récupérer la liste des tables")?
        };
        
        // Récupérer les relations
        let relations = odbc::get_relations(dsn)
            .unwrap_or_else(|_| Vec::new()); // Non bloquant si les relations ne sont pas disponibles
        
        // Collecter le schéma de chaque table (limité aux 20 premières pour éviter les timeouts)
        let mut schemas = HashMap::new();
        let mut indexes = HashMap::new();
        
        // Limiter le nombre de tables analysées pour éviter les timeouts
        let max_tables_to_analyze = 20;
        let tables_to_analyze: Vec<_> = tables.iter().take(max_tables_to_analyze).collect();
        
        get_logger().log_with_source(
            LogLevel::Info,
            format!("Analyse du schéma pour {} table(s) sur {} total", 
                tables_to_analyze.len(), tables.len()),
            Some("AI".to_string()),
        );
        
        for table in tables_to_analyze {
            // Essayer de récupérer le schéma via INFORMATION_SCHEMA (non bloquant)
            // Si cela échoue, on continue avec les autres tables
            match Self::get_table_schema(dsn, table) {
                Ok(schema) => {
                    schemas.insert(table.clone(), schema);
                }
                Err(e) => {
                    get_logger().log_with_source(
                        LogLevel::Debug,
                        format!("Impossible de récupérer le schéma pour {}: {}", table, e),
                        Some("AI".to_string()),
                    );
                }
            }
            
            // Essayer de récupérer les index (non bloquant)
            match Self::get_table_indexes(dsn, table) {
                Ok(table_indexes) => {
                    indexes.insert(table.clone(), table_indexes);
                }
                Err(e) => {
                    get_logger().log_with_source(
                        LogLevel::Debug,
                        format!("Impossible de récupérer les index pour {}: {}", table, e),
                        Some("AI".to_string()),
                    );
                }
            }
        }
        
        let stats = Some(DbStats {
            table_count: tables.len(),
            index_count: indexes.values().map(|v| v.len()).sum(),
            estimated_size: None, // Non disponible via ODBC standard
        });
        
        Ok(DbContext {
            dsn: dsn.to_string(),
            tables,
            schemas,
            indexes,
            relations,
            sql_query,
            stats,
        })
    }
    
    /**
     * Récupère le schéma d'une table.
     * 
     * @param dsn - Nom du DSN ODBC
     * @param table - Nom de la table
     * @returns Result<Vec<ColumnInfo>> - Liste des colonnes ou erreur
     */
    fn get_table_schema(dsn: &str, table: &str) -> Result<Vec<ColumnInfo>> {
        // Utiliser INFORMATION_SCHEMA pour récupérer les colonnes
        let query = format!(
            r#"
            SELECT 
                COLUMN_NAME,
                DATA_TYPE,
                IS_NULLABLE,
                CASE WHEN COLUMN_KEY = 'PRI' THEN 1 ELSE 0 END as IS_PRIMARY_KEY
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_NAME = '{}'
            ORDER BY ORDINAL_POSITION
            "#,
            table
        );
        
        let result = odbc::execute_odbc_query(dsn, &query)?;
        
        let mut columns = Vec::new();
        for row in result.rows {
            let name = row.get("COLUMN_NAME")
                .ok_or_else(|| anyhow::anyhow!("Colonne COLUMN_NAME manquante"))?
                .clone();
            let data_type = row.get("DATA_TYPE")
                .unwrap_or(&"UNKNOWN".to_string())
                .clone();
            let nullable = row.get("IS_NULLABLE")
                .map(|s| s == "YES" || s == "1");
            
            columns.push(ColumnInfo {
                name,
                data_type,
                nullable,
                is_primary_key: false, // Sera déterminé plus tard
                is_foreign_key: false, // Sera déterminé plus tard
            });
        }
        
        Ok(columns)
    }
    
    /**
     * Récupère les index d'une table.
     * 
     * @param dsn - Nom du DSN ODBC
     * @param table - Nom de la table
     * @returns Result<Vec<IndexInfo>> - Liste des index ou erreur
     */
    fn get_table_indexes(dsn: &str, table: &str) -> Result<Vec<IndexInfo>> {
        // Utiliser INFORMATION_SCHEMA pour récupérer les index
        let query = format!(
            r#"
            SELECT 
                INDEX_NAME,
                COLUMN_NAME,
                NON_UNIQUE
            FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_NAME = '{}'
            ORDER BY INDEX_NAME, SEQ_IN_INDEX
            "#,
            table
        );
        
        let result = odbc::execute_odbc_query(dsn, &query)?;
        
        // Grouper les colonnes par index
        let mut index_map: HashMap<String, (Vec<String>, bool)> = HashMap::new();
        
        for row in result.rows {
            let index_name = row.get("INDEX_NAME")
                .ok_or_else(|| anyhow::anyhow!("Colonne INDEX_NAME manquante"))?
                .clone();
            let column_name = row.get("COLUMN_NAME")
                .ok_or_else(|| anyhow::anyhow!("Colonne COLUMN_NAME manquante"))?
                .clone();
            let non_unique = row.get("NON_UNIQUE")
                .map(|s| s == "1" || s == "YES")
                .unwrap_or(true);
            
            let entry = index_map.entry(index_name).or_insert_with(|| (Vec::new(), !non_unique));
            entry.0.push(column_name);
        }
        
        let indexes: Vec<IndexInfo> = index_map
            .into_iter()
            .map(|(name, (columns, unique))| IndexInfo {
                name,
                columns,
                unique,
            })
            .collect();
        
        Ok(indexes)
    }
    
    /**
     * Génère des conseils DB à partir du contexte collecté.
     * 
     * Utilise l'API Mistral pour analyser le contexte et générer
     * des conseils structurés.
     * 
     * @param context - Contexte de la base de données
     * @returns Result<DbAdvisorResponse> - Conseils générés ou erreur
     * 
     * Effets de bord :
     * - Fait un appel à l'API Mistral
     */
    pub async fn generate_advice(&self, context: DbContext) -> Result<DbAdvisorResponse> {
        get_logger().log_with_source(
            LogLevel::Info,
            format!("Génération de conseils DB pour DSN: {}", context.dsn),
            Some("AI".to_string()),
        );
        
        // Construire le prompt pour Mistral
        let prompt = self.build_prompt(&context);
        
        // Appeler l'API Mistral avec streaming pour voir le thinking
        let response = self.client.generate_stream(prompt).await?;
        
        // Parser la réponse JSON
        let mut advisor_response: DbAdvisorResponse = serde_json::from_str(&response)
            .or_else(|e| {
                get_logger().log_with_source(
                    LogLevel::Warn,
                    format!("Erreur de parsing JSON: {}. Tentative d'extraction...", e),
                    Some("AI".to_string()),
                );
                // Si le parsing JSON échoue, essayer d'extraire les informations
                // depuis un format texte structuré
                Self::parse_text_response(&response)
            })?;
        
        // Nettoyer et restructurer la réponse pour s'assurer que chaque section est à sa place
        advisor_response = Self::clean_and_restructure_response(advisor_response);
        
        // Vérifier que la réponse contient des données
        match &advisor_response {
            DbAdvisorResponse::Structured { 
                diagnostic, 
                actions_recommandees, 
                risques, 
                .. 
            } => {
                let has_data = 
                    !diagnostic.is_null() ||
                    (!actions_recommandees.is_null() && actions_recommandees.as_array().map(|a| !a.is_empty()).unwrap_or(false)) ||
                    (!risques.is_null() && risques.as_array().map(|a| !a.is_empty()).unwrap_or(false));
                
                if !has_data {
                    get_logger().log_with_source(
                        LogLevel::Warn,
                        "Réponse structurée mais vide - tous les champs sont vides ou null".to_string(),
                        Some("AI".to_string()),
                    );
                }
            },
            DbAdvisorResponse::Raw(value) => {
                if value.is_null() {
                    get_logger().log_with_source(
                        LogLevel::Warn,
                        "Réponse brute est null".to_string(),
                        Some("AI".to_string()),
                    );
                }
            },
        }
        
        Ok(advisor_response)
    }
    
    /**
     * Construit le prompt pour l'API Mistral.
     * 
     * @param context - Contexte de la base de données
     * @returns String - Prompt formaté
     */
    fn build_prompt(&self, context: &DbContext) -> String {
        let mut prompt = String::from(
            "Tu es un expert en gestion de bases de données. Analyse le contexte suivant et fournis des conseils structurés en JSON.\n\n"
        );
        
        prompt.push_str(&format!("DSN: {}\n", context.dsn));
        prompt.push_str(&format!("Nombre de tables: {}\n", context.tables.len()));
        
        // Lister les noms des tables disponibles
        if !context.tables.is_empty() {
            prompt.push_str("\nTables disponibles:\n");
            for table in &context.tables {
                prompt.push_str(&format!("- {}\n", table));
            }
        } else {
            prompt.push_str("\n⚠️ Aucune table détectée dans cette base de données.\n");
        }
        
        if let Some(stats) = &context.stats {
            prompt.push_str(&format!("\nStatistiques: {} tables, {} index\n", stats.table_count, stats.index_count));
        }
        
        if !context.schemas.is_empty() {
            prompt.push_str("\nSchémas des tables:\n");
            for (table, columns) in &context.schemas {
                prompt.push_str(&format!("- Table {}: {} colonnes\n", table, columns.len()));
                for col in columns {
                    prompt.push_str(&format!("  * {} ({})\n", col.name, col.data_type));
                }
            }
        }
        
        if !context.indexes.is_empty() {
            prompt.push_str("\nIndex existants:\n");
            for (table, indexes) in &context.indexes {
                for idx in indexes {
                    prompt.push_str(&format!("- Table {}: Index {} sur {}\n", 
                        table, idx.name, idx.columns.join(", ")));
                }
            }
        }
        
        if !context.relations.is_empty() {
            prompt.push_str("\nRelations:\n");
            for rel in &context.relations {
                prompt.push_str(&format!("- {} ({}) -> {} ({})\n", 
                    rel.from_table, rel.from_column, rel.to_table, rel.to_column));
            }
        }
        
        if let Some(sql) = &context.sql_query {
            prompt.push_str(&format!("\nRequête SQL à analyser:\n{}\n", sql));
        }
        
        prompt.push_str("\n\n=== INSTRUCTIONS STRICTES POUR LA RÉPONSE JSON ===\n");
        prompt.push_str("⚠️ CRITIQUE: Réponds UNIQUEMENT avec du JSON valide, SANS AUCUN TEXTE avant ou après.\n");
        prompt.push_str("⚠️ NE PAS utiliser de blocs markdown (```json ou ```).\n");
        prompt.push_str("⚠️ NE PAS ajouter de texte comme 'Diagnostic', 'Actions recommandées', 'Risques' avant le JSON.\n");
        prompt.push_str("⚠️ NE PAS ajouter de texte explicatif après le JSON.\n");
        prompt.push_str("⚠️ La réponse doit COMMENCER DIRECTEMENT par '{' et SE TERMINER par '}'.\n");
        prompt.push_str("Chaque section doit être placée à son endroit exact dans la structure JSON.\n");
        prompt.push_str("NE PAS dupliquer le contenu entre les sections.\n");
        prompt.push_str("NE PAS mettre tout le JSON dans la section 'diagnostic'.\n");
        prompt.push_str("Les blocs de code SQL dans 'details' ou 'requete' doivent être échappés correctement (\\n pour les retours à la ligne).\n\n");
        prompt.push_str("Structure JSON EXACTE requise:\n");
        prompt.push_str(r#"{
  "diagnostic": {
    "etat_actuel": "Description textuelle de l'état actuel de la base de données (string uniquement, pas d'objets imbriqués)",
    "hypotheses": ["Hypothèse 1", "Hypothèse 2"],
    "verifications_prealables": ["Vérification 1", "Vérification 2"]
  },
  "actions_recommandees": [
    {
      "action": "Nom de l'action (string)",
      "details": "Description détaillée de l'action. Les exemples SQL doivent être échappés avec \\n pour les retours à la ligne.",
      "priorite": "haute|moyenne|basse"
    }
  ],
  "risques": [
    {
      "risque": "Nom du risque (string)",
      "cause": "Description de la cause (string)",
      "impact": "Description de l'impact (string)",
      "mitigation": "Description de la mitigation. Les exemples SQL doivent être échappés avec \\n."
    }
  ],
  "sql_suggere": [
    {
      "description": "Description de la requête SQL (string)",
      "requete": "SELECT ... FROM ... WHERE ..."
    }
  ],
  "niveau_confiance": 0.85,
  "notes_complementaires": {
    "outils_recommandes": ["Outil 1", "Outil 2"],
    "bonnes_pratiques": ["Pratique 1", "Pratique 2"]
  }
}"#);
        prompt.push_str("\n\nRÈGLES IMPORTANTES:\n");
        prompt.push_str("1. 'diagnostic' doit contenir UNIQUEMENT les 3 champs: etat_actuel, hypotheses, verifications_prealables\n");
        prompt.push_str("2. 'actions_recommandees' est un TABLEAU d'objets, chaque objet a: action, details, priorite\n");
        prompt.push_str("3. 'risques' est un TABLEAU d'objets, chaque objet a: risque, cause, impact, mitigation\n");
        prompt.push_str("4. 'sql_suggere' est un TABLEAU d'objets, chaque objet a: description, requete\n");
        prompt.push_str("5. Ne JAMAIS mettre le contenu de 'actions_recommandees', 'risques' ou 'sql_suggere' dans 'diagnostic'\n");
        prompt.push_str("6. Les chaînes SQL dans 'details' ou 'requete' doivent utiliser \\n pour les retours à la ligne, pas de blocs markdown\n");
        prompt.push_str("7. Le JSON doit être valide et parsable sans erreur\n");
        prompt.push_str("8. ⚠️ FORMAT DE RÉPONSE: Commence directement par '{' et termine par '}', sans texte avant/après\n");
        prompt.push_str("9. ⚠️ EXEMPLE DE MAUVAISE RÉPONSE (À ÉVITER):\n");
        prompt.push_str("   Diagnostic\n");
        prompt.push_str("   {\"diagnostic\": ...}\n");
        prompt.push_str("   Actions recommandées\n");
        prompt.push_str("   ...\n");
        prompt.push_str("10. ⚠️ EXEMPLE DE BONNE RÉPONSE (À SUIVRE):\n");
        prompt.push_str("    {\"diagnostic\": {...}, \"actions_recommandees\": [...], ...}\n");
        
        prompt
    }
    
    /**
     * Nettoie et restructure une réponse pour s'assurer que chaque section est à sa place.
     * 
     * Cette fonction vérifie si des sections sont mal placées (ex: tout dans 'diagnostic')
     * et les réorganise correctement.
     * 
     * @param response - Réponse à nettoyer
     * @returns DbAdvisorResponse - Réponse nettoyée et restructurée
     */
    fn clean_and_restructure_response(response: DbAdvisorResponse) -> DbAdvisorResponse {
        match response {
            DbAdvisorResponse::Structured {
                diagnostic,
                actions_recommandees,
                risques,
                sql_suggere,
                niveau_confiance,
                notes_complementaires,
            } => {
                // Vérifier si 'diagnostic' contient des sections qui devraient être au niveau racine
                let (clean_diagnostic, extracted_actions, extracted_risques, extracted_sql) = 
                    if let Some(diag_obj) = diagnostic.as_object() {
                        let mut clean_diag = serde_json::Map::new();
                        let mut extracted_acts = None;
                        let mut extracted_risks = None;
                        let mut extracted_sql = None;
                        
                        for (key, value) in diag_obj {
                            match key.as_str() {
                                "actions_recommandees" => {
                                    extracted_acts = Some(value.clone());
                                    get_logger().log_with_source(
                                        LogLevel::Info,
                                        "Section 'actions_recommandees' trouvée dans 'diagnostic', extraction...".to_string(),
                                        Some("AI".to_string()),
                                    );
                                }
                                "risques" => {
                                    extracted_risks = Some(value.clone());
                                    get_logger().log_with_source(
                                        LogLevel::Info,
                                        "Section 'risques' trouvée dans 'diagnostic', extraction...".to_string(),
                                        Some("AI".to_string()),
                                    );
                                }
                                "sql_suggere" => {
                                    extracted_sql = Some(value.clone());
                                    get_logger().log_with_source(
                                        LogLevel::Info,
                                        "Section 'sql_suggere' trouvée dans 'diagnostic', extraction...".to_string(),
                                        Some("AI".to_string()),
                                    );
                                }
                                _ => {
                                    // Garder les autres champs dans diagnostic
                                    clean_diag.insert(key.clone(), value.clone());
                                }
                            }
                        }
                        
                        let clean_diag_value = if clean_diag.is_empty() {
                            diagnostic.clone()
                        } else {
                            serde_json::Value::Object(clean_diag)
                        };
                        
                        (clean_diag_value, extracted_acts, extracted_risks, extracted_sql)
                    } else {
                        (diagnostic, None, None, None)
                    };
                
                // Utiliser les valeurs extraites ou celles déjà présentes
                let final_actions = extracted_actions
                    .or_else(|| {
                        if actions_recommandees.is_null() {
                            None
                        } else {
                            Some(actions_recommandees)
                        }
                    })
                    .unwrap_or_else(|| serde_json::Value::Array(Vec::new()));
                
                let final_risques = extracted_risques
                    .or_else(|| {
                        if risques.is_null() {
                            None
                        } else {
                            Some(risques)
                        }
                    })
                    .unwrap_or_else(|| serde_json::Value::Array(Vec::new()));
                
                let final_sql = if let Some(extracted) = extracted_sql {
                    Some(extracted)
                } else if let Some(sql) = &sql_suggere {
                    if sql.is_null() {
                        None
                    } else {
                        Some(sql.clone())
                    }
                } else {
                    None
                };
                
                DbAdvisorResponse::Structured {
                    diagnostic: clean_diagnostic,
                    actions_recommandees: final_actions,
                    risques: final_risques,
                    sql_suggere: final_sql,
                    niveau_confiance,
                    notes_complementaires,
                }
            }
            DbAdvisorResponse::Raw(value) => {
                // Essayer de restructurer un JSON brut
                if let Some(obj) = value.as_object() {
                    let mut restructured = serde_json::Map::new();
                    let mut diagnostic_obj = serde_json::Map::new();
                    let mut has_diagnostic = false;
                    
                    for (key, val) in obj {
                        match key.as_str() {
                            "diagnostic" => {
                                // Si diagnostic est un objet, l'utiliser directement
                                if let Some(diag_obj) = val.as_object() {
                                    for (k, v) in diag_obj {
                                        if k == "actions_recommandees" || k == "risques" || k == "sql_suggere" {
                                            restructured.insert(k.clone(), v.clone());
                                            get_logger().log_with_source(
                                                LogLevel::Info,
                                                format!("Section '{}' extraite de 'diagnostic' dans JSON brut", k),
                                                Some("AI".to_string()),
                                            );
                                        } else {
                                            diagnostic_obj.insert(k.clone(), v.clone());
                                            has_diagnostic = true;
                                        }
                                    }
                                } else {
                                    diagnostic_obj.insert("etat_actuel".to_string(), val.clone());
                                    has_diagnostic = true;
                                }
                            }
                            "actions_recommandees" | "risques" | "sql_suggere" | "niveau_confiance" | "notes_complementaires" => {
                                restructured.insert(key.clone(), val.clone());
                            }
                            _ => {
                                // Autres champs -> les mettre dans diagnostic
                                diagnostic_obj.insert(key.clone(), val.clone());
                                has_diagnostic = true;
                            }
                        }
                    }
                    
                    if has_diagnostic {
                        restructured.insert("diagnostic".to_string(), serde_json::Value::Object(diagnostic_obj));
                    }
                    
                    // Essayer de parser comme Structured
                    if let Ok(structured) = serde_json::from_value::<DbAdvisorResponse>(
                        serde_json::Value::Object(restructured)
                    ) {
                        return Self::clean_and_restructure_response(structured);
                    }
                }
                
                DbAdvisorResponse::Raw(value)
            }
        }
    }
    
    /**
     * Nettoie le texte en supprimant les blocs markdown et autres artefacts.
     * 
     * @param text - Texte à nettoyer
     * @returns String - Texte nettoyé
     */
    fn clean_text(text: &str) -> String {
        let mut cleaned = text.to_string();
        
        // Supprimer les blocs markdown ```json et ```
        cleaned = cleaned.replace("```json", "");
        cleaned = cleaned.replace("```JSON", "");
        cleaned = cleaned.replace("```", "");
        
        // Supprimer les lignes qui sont juste des titres comme "Diagnostic", "Actions recommandées", etc.
        let lines: Vec<&str> = cleaned.lines()
            .filter(|line| {
                let trimmed = line.trim();
                // Ignorer les lignes qui sont juste des titres (sans contenu JSON)
                !(trimmed.eq_ignore_ascii_case("Diagnostic") ||
                  trimmed.eq_ignore_ascii_case("Actions recommandées") ||
                  trimmed.eq_ignore_ascii_case("Actions recommandees") ||
                  trimmed.eq_ignore_ascii_case("Risques") ||
                  trimmed.eq_ignore_ascii_case("SQL suggéré") ||
                  trimmed.eq_ignore_ascii_case("SQL suggere") ||
                  (trimmed.starts_with("Diagnostic") && !trimmed.contains('{')) ||
                  (trimmed.starts_with("Actions") && !trimmed.contains('{')))
            })
            .collect();
        
        cleaned = lines.join("\n");
        
        // Supprimer les espaces en début et fin
        cleaned.trim().to_string()
    }
    
    /**
     * Extrait un JSON valide depuis un texte qui peut contenir du texte avant/après.
     * Gère les cas où le JSON est tronqué en cherchant le dernier } valide.
     * 
     * @param text - Texte contenant potentiellement du JSON
     * @returns Option<String> - JSON extrait ou None
     */
    fn extract_json_from_text(text: &str) -> Option<String> {
        // Nettoyer le texte d'abord
        let cleaned = Self::clean_text(text);
        
        // Chercher le premier '{' qui commence un objet JSON
        let start = cleaned.find('{')?;
        
        // Chercher le '}' correspondant en comptant les accolades
        // On ignore les accolades dans les chaînes JSON en suivant les guillemets
        let mut depth = 0;
        let mut end = None;
        let mut in_string = false;
        let mut escape_next = false;
        
        let slice = &cleaned[start..];
        let mut byte_pos = 0;
        
        for ch in slice.chars() {
            if escape_next {
                escape_next = false;
                byte_pos += ch.len_utf8();
                continue;
            }
            
            match ch {
                '\\' => {
                    escape_next = true;
                }
                '"' => {
                    in_string = !in_string;
                }
                '{' if !in_string => {
                    depth += 1;
                }
                '}' if !in_string => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(byte_pos);
                        break;
                    }
                }
                _ => {}
            }
            
            byte_pos += ch.len_utf8();
        }
        
        if let Some(end_offset) = end {
            Some(cleaned[start..=start + end_offset].to_string())
        } else {
            // Si on n'a pas trouvé de fermeture, chercher le dernier } dans le texte
            // (cas où le JSON est tronqué)
            if let Some(last_brace) = cleaned.rfind('}') {
                if last_brace > start {
                    get_logger().log_with_source(
                        LogLevel::Warn,
                        format!("JSON semble tronqué, utilisation du dernier }} trouvé à la position {}", last_brace),
                        Some("AI".to_string()),
                    );
                    Some(cleaned[start..=last_brace].to_string())
                } else {
                    None
                }
            } else {
                None
            }
        }
    }
    
    /**
     * Parse une réponse texte en DbAdvisorResponse.
     * 
     * Utilisé comme fallback si la réponse n'est pas en JSON valide.
     * Tente également de restructurer un JSON mal formaté où tout serait dans 'diagnostic'.
     * 
     * @param text - Réponse texte à parser
     * @returns Result<DbAdvisorResponse> - Réponse parsée ou erreur
     */
    fn parse_text_response(text: &str) -> Result<DbAdvisorResponse> {
        get_logger().log_with_source(
            LogLevel::Debug,
            format!("Tentative d'extraction JSON depuis texte de {} caractères", text.len()),
            Some("AI".to_string()),
        );
        
        // Essayer d'extraire un JSON depuis le texte
        let json_str = if let Some(json) = Self::extract_json_from_text(text) {
            get_logger().log_with_source(
                LogLevel::Debug,
                format!("JSON extrait: {} caractères", json.len()),
                Some("AI".to_string()),
            );
            json
        } else {
            get_logger().log_with_source(
                LogLevel::Warn,
                "Impossible d'extraire un JSON valide du texte".to_string(),
                Some("AI".to_string()),
            );
            // Fallback: chercher simplement le premier { et dernier }
            let cleaned = Self::clean_text(text);
            let json_start = cleaned.find('{');
            let json_end = cleaned.rfind('}');
            
            if let (Some(start), Some(end)) = (json_start, json_end) {
                cleaned[start..=end].to_string()
            } else {
                // Aucun JSON trouvé, retourner une erreur
                return Err(anyhow::anyhow!("Aucun JSON valide trouvé dans la réponse"));
            }
        };
        
        // Essayer de parser directement
        if let Ok(parsed) = serde_json::from_str::<DbAdvisorResponse>(&json_str) {
            get_logger().log_with_source(
                LogLevel::Info,
                "Parsing JSON réussi directement".to_string(),
                Some("AI".to_string()),
            );
            // Nettoyer et restructurer même si le parsing a réussi
            return Ok(Self::clean_and_restructure_response(parsed));
        }
        
        // Si le parsing échoue, logger l'erreur et essayer de parser comme un Value générique
        get_logger().log_with_source(
            LogLevel::Debug,
            format!("Parsing direct échoué, tentative avec Value générique. JSON (premiers 500 chars): {}", 
                json_str.chars().take(500).collect::<String>()),
            Some("AI".to_string()),
        );
        
        // Si le parsing échoue, essayer de parser comme un Value générique
        // et restructurer si nécessaire
        if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(&json_str) {
                // Vérifier si tout est dans 'diagnostic' et restructurer
                if let Some(diagnostic_obj) = json_value.get("diagnostic") {
                    if let Some(diag_obj) = diagnostic_obj.as_object() {
                        // Si 'diagnostic' contient des clés qui devraient être au niveau racine
                        let mut needs_restructure = false;
                        let mut actions = None;
                        let mut risques = None;
                        let mut sql_suggere = None;
                        
                        // Vérifier si 'diagnostic' contient 'actions_recommandees'
                        if diag_obj.contains_key("actions_recommandees") {
                            needs_restructure = true;
                            actions = diag_obj.get("actions_recommandees").cloned();
                        }
                        
                        // Vérifier si 'diagnostic' contient 'risques'
                        if diag_obj.contains_key("risques") {
                            needs_restructure = true;
                            risques = diag_obj.get("risques").cloned();
                        }
                        
                        // Vérifier si 'diagnostic' contient 'sql_suggere'
                        if diag_obj.contains_key("sql_suggere") {
                            needs_restructure = true;
                            sql_suggere = diag_obj.get("sql_suggere").cloned();
                        }
                        
                        // Restructurer si nécessaire
                        if needs_restructure {
                            // Créer un nouveau diagnostic sans les clés déplacées
                            let mut clean_diagnostic = serde_json::Map::new();
                            for (key, value) in diag_obj {
                                if key != "actions_recommandees" && key != "risques" && key != "sql_suggere" {
                                    clean_diagnostic.insert(key.clone(), value.clone());
                                }
                            }
                            
                            // Construire la réponse restructurée
                            let mut restructured = serde_json::Map::new();
                            restructured.insert("diagnostic".to_string(), serde_json::Value::Object(clean_diagnostic));
                            
                            if let Some(acts) = actions {
                                restructured.insert("actions_recommandees".to_string(), acts);
                            } else {
                                restructured.insert("actions_recommandees".to_string(), serde_json::Value::Array(Vec::new()));
                            }
                            
                            if let Some(risks) = risques {
                                restructured.insert("risques".to_string(), risks);
                            } else {
                                restructured.insert("risques".to_string(), serde_json::Value::Array(Vec::new()));
                            }
                            
                            if let Some(sql) = sql_suggere {
                                restructured.insert("sql_suggere".to_string(), sql);
                            }
                            
                            // Copier les autres champs du JSON original
                            for (key, value) in json_value.as_object().unwrap() {
                                if key != "diagnostic" && key != "actions_recommandees" && key != "risques" && key != "sql_suggere" {
                                    restructured.insert(key.clone(), value.clone());
                                }
                            }
                            
                            // Essayer de parser la version restructurée
                            let restructured_value = serde_json::Value::Object(restructured);
                            if let Ok(parsed) = serde_json::from_value::<DbAdvisorResponse>(restructured_value) {
                                return Ok(Self::clean_and_restructure_response(parsed));
                            }
                        }
                    }
                }
                
            // Essayer de parser le JSON tel quel après nettoyage
            if let Ok(parsed) = serde_json::from_value::<DbAdvisorResponse>(json_value.clone()) {
                get_logger().log_with_source(
                    LogLevel::Info,
                    "Parsing JSON réussi après conversion en Value".to_string(),
                    Some("AI".to_string()),
                );
                return Ok(Self::clean_and_restructure_response(parsed));
            } else {
                get_logger().log_with_source(
                    LogLevel::Warn,
                    format!("Impossible de parser le JSON même après conversion. Structure: {}", 
                        serde_json::to_string(&json_value).unwrap_or_else(|_| "erreur de sérialisation".to_string())),
                    Some("AI".to_string()),
                );
            }
        } else {
            get_logger().log_with_source(
                LogLevel::Error,
                format!("Impossible de parser le JSON même comme Value générique. Erreur probable dans la structure. JSON (premiers 1000 chars): {}", 
                    json_str.chars().take(1000).collect::<String>()),
                Some("AI".to_string()),
            );
        }
        
        // Fallback: créer une réponse basique depuis le texte
        get_logger().log_with_source(
            LogLevel::Warn,
            "Utilisation du fallback: création d'une réponse basique".to_string(),
            Some("AI".to_string()),
        );
        Ok(DbAdvisorResponse::Structured {
            diagnostic: serde_json::Value::String(format!("Erreur de parsing JSON. Texte reçu: {}", 
                text.chars().take(500).collect::<String>())),
            actions_recommandees: serde_json::Value::Array(Vec::new()),
            risques: serde_json::Value::Array(Vec::new()),
            sql_suggere: None,
            niveau_confiance: 0.0,
            notes_complementaires: None,
        })
    }
}

