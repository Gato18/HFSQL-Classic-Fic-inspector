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
        let advisor_response: DbAdvisorResponse = serde_json::from_str(&response)
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
        
        prompt.push_str("\nIMPORTANT: Réponds UNIQUEMENT avec du JSON valide, sans texte avant ou après. Structure JSON requise:\n");
        prompt.push_str(r#"{
  "diagnostic": {
    "etat_actuel": "Description de l'état actuel",
    "hypotheses": ["Hypothèse 1"],
    "verifications_prealables": ["Vérification 1"]
  },
  "actions_recommandees": [
    {
      "action": "Nom de l'action",
      "details": "Description détaillée",
      "priorite": "haute"
    }
  ],
  "risques": [
    {
      "risque": "Nom du risque",
      "cause": "Cause",
      "impact": "Impact",
      "mitigation": "Mitigation"
    }
  ],
  "sql_suggere": [
    {
      "description": "Description",
      "requete": "SELECT ..."
    }
  ],
  "niveau_confiance": 0.85,
  "notes_complementaires": {
    "outils_recommandes": ["Outil 1"],
    "bonnes_pratiques": ["Pratique 1"]
  }
}"#);
        
        prompt
    }
    
    /**
     * Parse une réponse texte en DbAdvisorResponse.
     * 
     * Utilisé comme fallback si la réponse n'est pas en JSON valide.
     * 
     * @param text - Réponse texte à parser
     * @returns Result<DbAdvisorResponse> - Réponse parsée ou erreur
     */
    fn parse_text_response(text: &str) -> Result<DbAdvisorResponse> {
        // Essayer d'extraire un JSON depuis le texte
        // Chercher des blocs JSON entre accolades
        let json_start = text.find('{');
        let json_end = text.rfind('}');
        
        if let (Some(start), Some(end)) = (json_start, json_end) {
            let json_str = &text[start..=end];
            if let Ok(parsed) = serde_json::from_str::<DbAdvisorResponse>(json_str) {
                return Ok(parsed);
            }
        }
        
        // Fallback: créer une réponse basique depuis le texte
        Ok(DbAdvisorResponse::Structured {
            diagnostic: serde_json::Value::String(text.to_string()),
            actions_recommandees: serde_json::Value::Array(Vec::new()),
            risques: serde_json::Value::Array(Vec::new()),
            sql_suggere: None,
            niveau_confiance: 0.5,
            notes_complementaires: None,
        })
    }
}

