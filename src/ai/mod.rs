/**
 * Module IA pour FIC Engine.
 * 
 * Ce module fournit des fonctionnalités d'intelligence artificielle pour
 * l'analyse et l'optimisation de bases de données. Il utilise l'API Mistral
 * pour générer des conseils intelligents sur la gestion de bases de données.
 * 
 * Structure :
 * - client.rs : Client pour l'API Mistral
 * - advisor.rs : Logique de conseil DB (collecte contexte, génération conseils)
 * - handlers.rs : Handlers HTTP pour les endpoints IA
 * 
 * Fonctionnalités :
 * - Diagnostic de performance (requêtes lentes, index manquants, plans d'exécution)
 * - Qualité et cohérence des données (doublons, nulls critiques, contraintes)
 * - Recommandations (index, requêtes alternatives, normalisation, maintenance)
 * 
 * Sécurité :
 * - Mode lecture seule (ne jamais exécuter le SQL généré)
 * - Masquage des secrets dans les logs
 * - Timeouts et gestion d'erreurs robuste
 */

pub mod client;
pub mod advisor;
pub mod handlers;

pub use client::MistralClient;
pub use advisor::DbAdvisor;

