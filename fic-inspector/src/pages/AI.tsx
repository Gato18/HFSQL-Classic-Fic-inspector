import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Trash2, Database, Sparkles, ChevronDown, ChevronUp, History } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiClient } from '../services/apiClient';
import { dsnService, DSN } from '../services/dsnService';
import { conversationService, Conversation, Message } from '../services/conversationService';
import toast, { Toaster } from 'react-hot-toast';
import AdvisorResponse from '../components/AdvisorResponse';
import ConversationHistory from '../components/ConversationHistory';

// Fonction pour nettoyer les blocs markdown JSON (réutilisable)
const cleanMarkdownJsonBlocks = (text: string): string => {
  if (typeof text !== 'string') return text;
  return text.replace(/```json\s*\n?([\s\S]*?)```/gi, (_match, jsonContent) => {
    try {
      const parsed = JSON.parse(jsonContent.trim());
      const formatted = JSON.stringify(parsed, null, 2);
      return `\n[Données JSON formatées]\n${formatted}\n`;
    } catch (e) {
      return `\n${jsonContent.trim()}\n`;
    }
  });
};

const MISTRAL_API_KEY_STORAGE = 'fic_inspector_mistral_api_key';

const AI: React.FC = () => {
  const [question, setQuestion] = useState('');
  const [sqlQuery, setSqlQuery] = useState('');
  const [showSqlInput, setShowSqlInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [availableDsns, setAvailableDsns] = useState<DSN[]>([]);
  const [dsn, setDsn] = useState<string>('');
  const [customDsn, setCustomDsn] = useState<string>('');
  const [useCustomDsn, setUseCustomDsn] = useState(false);
  const [mode, setMode] = useState<string>('diagnostic');
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(undefined);
  const [showHistory, setShowHistory] = useState(false);
  const [tables, setTables] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Charger les DSN disponibles
  useEffect(() => {
    loadDSNs();
    
    const handleStorageChange = () => {
      loadDSNs();
    };
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('dsnUpdated', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('dsnUpdated', handleStorageChange);
    };
  }, []);

  // Charger les tables quand un DSN est sélectionné
  useEffect(() => {
    const currentDsnValue = getCurrentDsn();
    if (currentDsnValue && availableDsns.length > 0) {
      loadTables();
    }
  }, [dsn, customDsn, useCustomDsn, availableDsns]);

  // Scroll vers le bas quand de nouveaux messages arrivent
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Sauvegarder automatiquement la conversation quand des messages sont ajoutés (avec debounce)
  useEffect(() => {
    if (messages.length > 0) {
      const timeoutId = setTimeout(() => {
        const currentDsnValue = useCustomDsn ? customDsn : dsn;
        if (!currentDsnValue) return;

        try {
          const title = conversationService.generateTitle(messages);
          
          if (currentConversationId) {
            // Mettre à jour la conversation existante
            conversationService.update(currentConversationId, {
              title,
              dsn: currentDsnValue,
              mode,
              messages: messages,
            });
          } else {
            // Créer une nouvelle conversation
            const newConversation = conversationService.save({
              title,
              dsn: currentDsnValue,
              mode,
              messages: messages,
            });
            setCurrentConversationId(newConversation.id);
          }
        } catch (error) {
          console.error('Erreur lors de la sauvegarde de la conversation:', error);
        }
      }, 1000); // Attendre 1 seconde après le dernier changement

      return () => clearTimeout(timeoutId);
    }
  }, [messages, currentConversationId, mode, dsn, customDsn, useCustomDsn]);

  const loadDSNs = async () => {
    try {
      const dsns = await dsnService.getAllFromBackend();
      setAvailableDsns(dsns);
      
      if (!dsn && dsns.length > 0 && !useCustomDsn) {
        setDsn(dsns[0].name);
      } else if (dsn && dsns.length > 0 && !useCustomDsn) {
        const currentDsnExists = dsns.some(d => d.name === dsn);
        if (!currentDsnExists) {
          setDsn(dsns[0].name);
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement des DSN:', error);
      const dsns = dsnService.getAll();
      setAvailableDsns(dsns);
      
      if (!dsn && dsns.length > 0 && !useCustomDsn) {
        setDsn(dsns[0].name);
      }
    }
  };

  // Charger les tables depuis le chemin du DSN (comme dans Query Studio)
  const loadTables = async () => {
    const currentDsnValue = getCurrentDsn();
    if (!currentDsnValue) return;

    try {
      // Récupérer le chemin du DSN depuis la liste des DSN disponibles
      const dsnConfig = availableDsns.find(d => d.name === currentDsnValue);
      
      // Si le DSN a un chemin configuré, utiliser scanDirectory pour scanner ce dossier
      if (dsnConfig && dsnConfig.path && dsnConfig.path.trim() !== '') {
        console.log(`📁 [IA] Utilisation du chemin du DSN ${currentDsnValue}: ${dsnConfig.path}`);
        const response = await apiClient.scanDirectory(dsnConfig.path);
        if (response.success) {
          setTables(response.tables);
          console.log(`✅ [IA] ${response.tables.length} table(s) trouvée(s) dans ${dsnConfig.path}`);
        } else {
          console.warn(`⚠️ [IA] Erreur lors du scan du dossier ${dsnConfig.path}`);
          setTables([]);
        }
      } else {
        // Si pas de chemin, essayer via ODBC
        try {
          const response = await apiClient.getOdbcTables(currentDsnValue);
          if (response.success) {
            setTables(response.tables);
            console.log(`✅ [IA] ${response.tables.length} table(s) trouvée(s) via ODBC`);
          } else {
            setTables([]);
          }
        } catch (error) {
          console.warn(`⚠️ [IA] Erreur lors du chargement des tables via ODBC:`, error);
          setTables([]);
        }
      }
    } catch (error) {
      console.error('Erreur lors du chargement des tables:', error);
      setTables([]);
    }
  };

  const getCurrentDsn = (): string => {
    return useCustomDsn ? customDsn : dsn;
  };

  const handleQuickAction = (action: string) => {
    setQuestion(action);
    setShowSqlInput(false);
    setSqlQuery('');
  };

  const handleSend = async () => {
    if (!question.trim()) return;

    const currentDsn = getCurrentDsn();
    if (!currentDsn) {
      toast.error('Aucun DSN sélectionné. Veuillez sélectionner un DSN ou en créer un.');
      return;
    }

    // Ajouter le message utilisateur
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);

    // Réinitialiser le champ
    setQuestion('');
    setLoading(true);

    try {
      // Récupérer la clé API Mistral depuis localStorage
      const mistralApiKey = localStorage.getItem(MISTRAL_API_KEY_STORAGE) || undefined;
      
      const response = await apiClient.dbAdvisor(
        currentDsn,
        sqlQuery.trim() || undefined,
        mistralApiKey,
        tables.length > 0 ? tables : undefined
      );

      if (response.success && response.advice) {
        // Extraire le texte du diagnostic (peut être un objet ou une string)
        let diagnosticText = '';
        const diagnostic = response.advice.diagnostic as any;
        if (typeof diagnostic === 'string') {
          diagnosticText = cleanMarkdownJsonBlocks(diagnostic);
        } else if (diagnostic && typeof diagnostic === 'object') {
          if (diagnostic.etat_actuel && typeof diagnostic.etat_actuel === 'string') {
            diagnosticText = cleanMarkdownJsonBlocks(diagnostic.etat_actuel);
          } else {
            diagnosticText = 'Diagnostic disponible (voir détails ci-dessous)';
          }
        }
        
        // Vérifier que les données sont présentes
        const hasData = 
          (response.advice.diagnostic !== undefined && response.advice.diagnostic !== null) ||
          (response.advice.actions_recommandees !== undefined && Array.isArray(response.advice.actions_recommandees) && response.advice.actions_recommandees.length > 0) ||
          (response.advice.risques !== undefined && Array.isArray(response.advice.risques) && response.advice.risques.length > 0);
        
        if (!hasData) {
          toast.error('La réponse de l\'IA est vide. Veuillez réessayer.');
        }
        
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: diagnosticText || 'Analyse terminée',
          timestamp: new Date(),
          advice: response.advice,
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Erreur: ${response.error || 'Erreur inconnue'}`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
        toast.error(response.error || 'Erreur lors de la génération des conseils');
      }
    } catch (error: any) {
      console.error('Erreur lors de la génération des conseils:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Erreur: ${error.message || 'Erreur lors de la génération des conseils'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      toast.error(error.message || 'Erreur lors de la génération des conseils');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadConversation = (conversation: Conversation) => {
    // Les messages sont déjà au bon format
    setMessages(conversation.messages);
    setCurrentConversationId(conversation.id);
    setDsn(conversation.dsn);
    setUseCustomDsn(false);
    setCustomDsn('');
    setMode(conversation.mode);
    toast.success('Conversation chargée');
  };

  const handleNewDiagnostic = () => {
    if (window.confirm('Voulez-vous vraiment démarrer une nouvelle conversation ? La conversation actuelle sera sauvegardée.')) {
      setMessages([]);
      setQuestion('');
      setSqlQuery('');
      setShowSqlInput(false);
      setCurrentConversationId(undefined);
      toast.success('Nouvelle conversation démarrée');
    }
  };


  const quickActions = [
    { label: 'Index manquants', question: 'Quels index manquent pour optimiser les performances ?' },
    { label: 'Requêtes lentes', question: 'Quelles requêtes sont lentes et comment les optimiser ?' },
    { label: 'Doublons', question: 'Y a-t-il des doublons dans les données ?' },
    { label: 'Plan d\'exécution', question: 'Analyse le plan d\'exécution de cette base de données' },
    { label: 'Nettoyage', question: 'Quelles actions de nettoyage recommandes-tu pour cette base ?' },
  ];

  return (
    <div className="h-full flex flex-col bg-theme-background text-theme-foreground">
      <Toaster position="top-right" />
      
      {/* Bandeau / Contexte */}
      <div className="p-6 border-b border-theme-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-2 text-theme-foreground">IA</h1>
            <p className="text-theme-secondary text-sm">
              Conseil DB intelligent
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-theme-statusbar font-semibold">DSN ODBC:</label>
              <div className="flex items-center gap-2">
                {availableDsns.length > 0 ? (
                  <>
                    <select
                      value={useCustomDsn ? 'custom' : dsn}
                      onChange={(e) => {
                        if (e.target.value === 'custom') {
                          setUseCustomDsn(true);
                          setCustomDsn('');
                        } else {
                          setUseCustomDsn(false);
                          setDsn(e.target.value);
                        }
                      }}
                      className="px-3 py-1.5 bg-theme-input border border-theme-input rounded text-sm text-theme-input focus:outline-none focus:ring-2 ring-theme-focus min-w-[200px]"
                    >
                      {availableDsns.map((dsnConfig) => (
                        <option key={dsnConfig.id} value={dsnConfig.name}>
                          {dsnConfig.name}
                        </option>
                      ))}
                      <option value="custom">DSN personnalisé...</option>
                    </select>
                    {useCustomDsn && (
                      <input
                        type="text"
                        value={customDsn}
                        onChange={(e) => setCustomDsn(e.target.value)}
                        placeholder="Nom du DSN personnalisé"
                        className="px-3 py-1.5 bg-theme-input border border-theme-input rounded text-sm text-theme-input focus:outline-none focus:ring-2 ring-theme-focus min-w-[200px]"
                        autoFocus
                      />
                    )}
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      value={customDsn}
                      onChange={(e) => {
                        setCustomDsn(e.target.value);
                        setUseCustomDsn(true);
                      }}
                      placeholder="Nom du DSN"
                      className="px-3 py-1.5 bg-theme-input border border-theme-input rounded text-sm text-theme-input focus:outline-none focus:ring-2 ring-theme-focus min-w-[200px]"
                    />
                    <Link
                      to="/dsn"
                      className="px-3 py-1.5 bg-theme-primary rounded text-sm text-white transition-colors flex items-center gap-1"
                      title="Gérer les DSN"
                    >
                      <Database className="w-4 h-4" />
                      Configurer
                    </Link>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-theme-statusbar font-semibold">Mode:</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="px-3 py-1.5 bg-theme-input border border-theme-input rounded text-sm text-theme-input focus:outline-none focus:ring-2 ring-theme-focus"
              >
                <option value="diagnostic">Diagnostic</option>
                <option value="optimisation">Optimisation</option>
                <option value="qualite">Qualité des données</option>
              </select>
            </div>
            <button
              onClick={() => setShowHistory(true)}
              className="px-3 py-1.5 bg-theme-secondary rounded text-sm text-white transition-colors flex items-center gap-2 hover:bg-theme-secondary/80"
              title="Historique des conversations"
            >
              <History className="w-4 h-4" />
              Historique
            </button>
          </div>
        </div>
      </div>

      {/* Historique des conversations */}
      <ConversationHistory
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onLoadConversation={handleLoadConversation}
        currentConversationId={currentConversationId}
      />

      <div className="flex-1 flex flex-col gap-4 p-6 overflow-hidden min-h-0">
        {/* Zone de conversation */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto bg-theme-input border border-theme-input rounded-lg p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-theme-secondary">
                <Sparkles className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-semibold mb-2">Bienvenue dans le Conseil DB intelligent</p>
                <p className="text-sm">Posez une question ou utilisez un des boutons rapides ci-dessous pour commencer</p>
              </div>
            ) : (
              <>
                {loading && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] rounded-lg p-4 bg-theme-card border border-theme-card">
                      <div className="flex items-center gap-2 text-theme-statusbar">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">L'IA analyse la base de données... (cela peut prendre quelques minutes)</span>
                        <span className="flex gap-1">
                          <span className="animate-bounce" style={{ animationDelay: '0ms' }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: '150ms' }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: '300ms' }}>.</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-4 ${
                        message.role === 'user'
                          ? 'bg-theme-primary text-white'
                          : 'bg-theme-card border border-theme-card text-theme-card'
                      }`}
                    >
                      {message.role === 'user' ? (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      ) : (
                        <div className="space-y-4">
                          {message.content && (
                            <p className="text-sm whitespace-pre-wrap text-theme-statusbar">{message.content}</p>
                          )}
                          
                          {message.advice && <AdvisorResponse advice={message.advice} />}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Boutons rapides */}
          <div className="flex-shrink-0">
            <label className="text-sm font-semibold text-theme-statusbar mb-2 block">
              Actions rapides
            </label>
            <div className="flex flex-wrap gap-2">
              {quickActions.map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => handleQuickAction(action.question)}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs bg-theme-secondary border border-theme-input rounded transition-colors text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-theme-secondary/80"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* Zone de saisie */}
          <div className="flex-shrink-0 space-y-2">
            {/* SQL à analyser (collapsible) */}
            <div className="bg-theme-input border border-theme-input rounded-lg">
              <button
                onClick={() => setShowSqlInput(!showSqlInput)}
                className="w-full flex items-center justify-between px-4 py-2 text-sm text-theme-statusbar hover:bg-theme-input/50 transition-colors"
              >
                <span>SQL à analyser (optionnel)</span>
                {showSqlInput ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
              {showSqlInput && (
                <div className="px-4 pb-4">
                  <textarea
                    value={sqlQuery}
                    onChange={(e) => setSqlQuery(e.target.value)}
                    placeholder="Collez ici une requête SQL à analyser..."
                    className="w-full bg-theme-background border border-theme-input rounded p-3 text-sm font-mono text-theme-input placeholder-theme-input focus:outline-none focus:ring-2 ring-theme-focus resize-none"
                    rows={4}
                    spellCheck={false}
                  />
                </div>
              )}
            </div>

            {/* Champ de question */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Votre question..."
                disabled={loading}
                className="flex-1 px-4 py-2 bg-theme-input border border-theme-input rounded-lg text-theme-input placeholder-theme-input focus:outline-none focus:ring-2 ring-theme-focus disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={handleSend}
                disabled={loading || !question.trim()}
                className="px-4 py-2 bg-theme-primary disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Envoi...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Envoyer</span>
                  </>
                )}
              </button>
              {messages.length > 0 && (
                <button
                  onClick={handleNewDiagnostic}
                  disabled={loading}
                  className="px-3 py-2 bg-theme-secondary disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2"
                  title="Nouveau diagnostic"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AI;