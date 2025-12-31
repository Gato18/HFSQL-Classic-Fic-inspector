import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Save, RefreshCw, Eye, EyeOff, Check, ChevronDown, ChevronUp, Palette } from 'lucide-react';
import { themes, Theme } from '../themes';

const MISTRAL_API_KEY_STORAGE = 'fic_inspector_mistral_api_key';
const CUSTOM_THEME_STORAGE = 'fic_inspector_custom_theme';

const Settings: React.FC = () => {
  const { apiUrl, setApiUrl, refreshConnection, connectionStatus, themeId, setTheme } = useApp();
  const [localApiUrl, setLocalApiUrl] = useState(apiUrl);
  const [mistralApiKey, setMistralApiKey] = useState('');
  const [showMistralKey, setShowMistralKey] = useState(false);
  const [showAllThemes, setShowAllThemes] = useState(false);
  const [showCustomTheme, setShowCustomTheme] = useState(false);
  
  // État pour le thème personnalisé
  const [customTheme, setCustomTheme] = useState<Partial<Theme['colors']>>({
    background: '#0f172a',
    foreground: '#f1f5f9',
    border: '#334155',
    primary: '#3b82f6',
    secondary: '#64748b',
    accent: '#60a5fa',
    sidebar: {
      bg: '#1e293b',
      border: '#334155',
      text: '#f1f5f9',
      active: '#3b82f6',
      hover: '#334155',
    },
    statusBar: {
      bg: '#1e293b',
      border: '#334155',
      text: '#cbd5e1',
    },
    card: {
      bg: '#1e293b',
      border: '#334155',
      text: '#f1f5f9',
    },
    input: {
      bg: '#1e293b',
      border: '#475569',
      text: '#f1f5f9',
      placeholder: '#94a3b8',
      focus: '#3b82f6',
    },
    button: {
      primary: '#3b82f6',
      primaryHover: '#2563eb',
      secondary: '#475569',
      secondaryHover: '#64748b',
    },
    scrollbar: {
      track: '#1e293b',
      thumb: '#475569',
      thumbHover: '#64748b',
    },
    menubar: {
      bg: '#1e293b',
      border: '#334155',
      text: '#f1f5f9',
      hover: '#334155',
      active: '#3b82f6',
      activeText: '#ffffff',
      dropdown: {
        bg: '#1e293b',
        border: '#334155',
        text: '#f1f5f9',
        hover: '#334155',
        separator: '#334155',
      },
      controls: {
        text: '#f1f5f9',
        hover: '#475569',
      },
    },
  });

  useEffect(() => {
    // Charger la clé API Mistral depuis localStorage
    const stored = localStorage.getItem(MISTRAL_API_KEY_STORAGE);
    if (stored) {
      setMistralApiKey(stored);
    }
    
    // Charger le thème personnalisé depuis localStorage
    const customThemeStored = localStorage.getItem(CUSTOM_THEME_STORAGE);
    if (customThemeStored) {
      try {
        const parsed = JSON.parse(customThemeStored);
        setCustomTheme(parsed);
        // Ajouter le thème personnalisé aux thèmes disponibles
        (themes as any).custom = {
          id: 'custom',
          name: 'Personnalisé',
          colors: parsed,
        };
      } catch (e) {
        console.error('Erreur lors du chargement du thème personnalisé:', e);
      }
    }
  }, []);

  const handleSave = () => {
    setApiUrl(localApiUrl);
    // Sauvegarder la clé API Mistral
    if (mistralApiKey.trim()) {
      localStorage.setItem(MISTRAL_API_KEY_STORAGE, mistralApiKey.trim());
    } else {
      localStorage.removeItem(MISTRAL_API_KEY_STORAGE);
    }
    refreshConnection();
  };

  const handleApplyCustomTheme = () => {
    // Créer un thème complet à partir des couleurs personnalisées
    const fullCustomTheme: Theme = {
      id: 'custom',
      name: 'Personnalisé',
      colors: customTheme as Theme['colors'],
    };
    
    // Sauvegarder le thème personnalisé
    localStorage.setItem(CUSTOM_THEME_STORAGE, JSON.stringify(customTheme));
    
    // Ajouter le thème personnalisé aux thèmes disponibles temporairement
    (themes as any).custom = fullCustomTheme;
    
    // Appliquer le thème
    setTheme('custom');
  };

  const handleResetCustomTheme = () => {
    const defaultTheme = themes.dark;
    setCustomTheme(defaultTheme.colors);
    localStorage.removeItem(CUSTOM_THEME_STORAGE);
    // Supprimer le thème personnalisé de la liste
    delete (themes as any).custom;
    // Si le thème actif est personnalisé, revenir au thème par défaut
    if (themeId === 'custom') {
      setTheme('dark');
    }
  };

  // Obtenir les thèmes à afficher (exclure le thème personnalisé de la liste principale)
  const themeList = Object.values(themes).filter(theme => theme.id !== 'custom');
  let displayedThemes = showAllThemes ? themeList : themeList.slice(0, 3);
  
  // Ajouter le thème personnalisé à la fin s'il existe
  if (themes.custom) {
    displayedThemes = [...displayedThemes, themes.custom];
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-theme-foreground">Paramètres</h1>

      <div className="bg-theme-card rounded-lg border border-theme-card p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-4 text-theme-card">Connexion API</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-theme-statusbar mb-2">
                URL de l'API
              </label>
              <input
                type="text"
                value={localApiUrl}
                onChange={(e) => setLocalApiUrl(e.target.value)}
                placeholder="http://127.0.0.1:8080"
                className="w-full px-4 py-2 bg-theme-input border border-theme-input rounded-lg text-theme-input placeholder-theme-input focus:outline-none focus:ring-2 ring-theme-focus"
              />
              <p className="mt-1 text-xs text-theme-statusbar opacity-75">
                URL de base de l'API REST backend
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-theme-primary rounded-lg text-white transition-colors"
              >
                <Save className="w-4 h-4" />
                Enregistrer
              </button>
              <button
                onClick={refreshConnection}
                disabled={connectionStatus === 'connecting'}
                className="flex items-center gap-2 px-4 py-2 bg-theme-secondary disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white transition-colors"
              >
                <RefreshCw className={connectionStatus === 'connecting' ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
                Tester la connexion
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-theme-card pt-6">
          <h2 className="text-xl font-semibold mb-4 text-theme-card">Intelligence Artificielle</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-theme-statusbar mb-2">
                Clé API Mistral
              </label>
              <div className="relative">
                <input
                  type={showMistralKey ? 'text' : 'password'}
                  value={mistralApiKey}
                  onChange={(e) => setMistralApiKey(e.target.value)}
                  placeholder="Votre clé API Mistral"
                  className="w-full px-4 py-2 pr-10 bg-theme-input border border-theme-input rounded-lg text-theme-input placeholder-theme-input focus:outline-none focus:ring-2 ring-theme-focus"
                />
                <button
                  type="button"
                  onClick={() => setShowMistralKey(!showMistralKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-theme-secondary hover:text-theme-foreground transition-colors"
                  title={showMistralKey ? 'Masquer' : 'Afficher'}
                >
                  {showMistralKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1 text-xs text-theme-statusbar opacity-75">
                Clé API Mistral pour les fonctionnalités IA. Obtenez votre clé sur{' '}
                <a
                  href="https://console.mistral.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-theme-primary hover:underline"
                >
                  console.mistral.ai
                </a>
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-theme-card pt-6">
          <h2 className="text-xl font-semibold mb-4 text-theme-card">Personnalisation du thème</h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-theme-statusbar mb-4">
                Sélectionnez un thème
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {displayedThemes.map((theme) => {
                  const isSelected = themeId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      onClick={() => setTheme(theme.id)}
                      className={`relative p-4 rounded-lg border-2 transition-all hover:scale-105 ${
                        isSelected
                          ? 'border-theme-primary shadow-lg'
                          : 'border-theme-card hover:border-theme-primary/50'
                      }`}
                      style={{
                        backgroundColor: theme.colors.card.bg,
                        borderColor: isSelected ? theme.colors.primary : theme.colors.card.border,
                        boxShadow: isSelected ? `0 0 0 2px ${theme.colors.background}, 0 4px 6px -1px rgba(0, 0, 0, 0.1)` : undefined,
                      }}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: theme.colors.primary }}
                        >
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="flex gap-1">
                          <div
                            className="w-8 h-8 rounded"
                            style={{ backgroundColor: theme.colors.primary }}
                            title="Couleur primaire"
                          />
                          <div
                            className="w-8 h-8 rounded"
                            style={{ backgroundColor: theme.colors.secondary }}
                            title="Couleur secondaire"
                          />
                          <div
                            className="w-8 h-8 rounded"
                            style={{ backgroundColor: theme.colors.accent }}
                            title="Couleur d'accent"
                          />
                        </div>
                        <div className="text-left">
                          <div
                            className="font-semibold text-sm"
                            style={{ color: theme.colors.card.text }}
                          >
                            {theme.name}
                          </div>
                          <div className="flex gap-1 mt-2">
                            <div
                              className="flex-1 h-2 rounded"
                              style={{ backgroundColor: theme.colors.background }}
                            />
                            <div
                              className="flex-1 h-2 rounded"
                              style={{ backgroundColor: theme.colors.sidebar.bg }}
                            />
                            <div
                              className="flex-1 h-2 rounded"
                              style={{ backgroundColor: theme.colors.card.bg }}
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              
              {themeList.length > 3 && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => setShowAllThemes(!showAllThemes)}
                    className="flex items-center gap-2 px-4 py-2 bg-theme-secondary hover:bg-theme-secondary/80 rounded-lg text-white transition-colors"
                  >
                    {showAllThemes ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        Afficher moins
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Afficher plus ({themeList.length - 3} autres)
                      </>
                    )}
                  </button>
                </div>
              )}
              
              <p className="mt-4 text-xs text-theme-statusbar opacity-75">
                Choisissez un thème pour personnaliser l'apparence de l'application. Le changement est appliqué immédiatement.
              </p>
            </div>

            {/* Section Thème Personnalisé */}
            <div className="border-t border-theme-card pt-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Palette className="w-5 h-5 text-theme-primary" />
                  <h3 className="text-lg font-semibold text-theme-card">Thème personnalisé</h3>
                </div>
                <button
                  onClick={() => setShowCustomTheme(!showCustomTheme)}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-theme-secondary hover:bg-theme-secondary/80 rounded-lg text-white transition-colors"
                >
                  {showCustomTheme ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showCustomTheme ? 'Masquer' : 'Afficher'}
                </button>
              </div>
              
              {showCustomTheme && (
                <div className="space-y-4 bg-theme-card/30 rounded-lg p-4 border border-theme-card">
                  <p className="text-sm text-theme-statusbar opacity-75 mb-4">
                    Créez votre propre thème en personnalisant les couleurs de l'interface.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Couleurs principales */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-theme-card">Couleurs principales</h4>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-theme-statusbar mb-1">Fond</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={customTheme.background || '#0f172a'}
                              onChange={(e) => setCustomTheme({ ...customTheme, background: e.target.value })}
                              className="w-12 h-10 rounded border border-theme-card cursor-pointer"
                            />
                            <input
                              type="text"
                              value={customTheme.background || '#0f172a'}
                              onChange={(e) => setCustomTheme({ ...customTheme, background: e.target.value })}
                              className="flex-1 px-3 py-2 bg-theme-input border border-theme-input rounded text-theme-input text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-theme-statusbar mb-1">Texte</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={customTheme.foreground || '#f1f5f9'}
                              onChange={(e) => setCustomTheme({ ...customTheme, foreground: e.target.value })}
                              className="w-12 h-10 rounded border border-theme-card cursor-pointer"
                            />
                            <input
                              type="text"
                              value={customTheme.foreground || '#f1f5f9'}
                              onChange={(e) => setCustomTheme({ ...customTheme, foreground: e.target.value })}
                              className="flex-1 px-3 py-2 bg-theme-input border border-theme-input rounded text-theme-input text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-theme-statusbar mb-1">Primaire</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={customTheme.primary || '#3b82f6'}
                              onChange={(e) => setCustomTheme({ ...customTheme, primary: e.target.value })}
                              className="w-12 h-10 rounded border border-theme-card cursor-pointer"
                            />
                            <input
                              type="text"
                              value={customTheme.primary || '#3b82f6'}
                              onChange={(e) => setCustomTheme({ ...customTheme, primary: e.target.value })}
                              className="flex-1 px-3 py-2 bg-theme-input border border-theme-input rounded text-theme-input text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-theme-statusbar mb-1">Secondaire</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={customTheme.secondary || '#64748b'}
                              onChange={(e) => setCustomTheme({ ...customTheme, secondary: e.target.value })}
                              className="w-12 h-10 rounded border border-theme-card cursor-pointer"
                            />
                            <input
                              type="text"
                              value={customTheme.secondary || '#64748b'}
                              onChange={(e) => setCustomTheme({ ...customTheme, secondary: e.target.value })}
                              className="flex-1 px-3 py-2 bg-theme-input border border-theme-input rounded text-theme-input text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-theme-statusbar mb-1">Accent</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={customTheme.accent || '#60a5fa'}
                              onChange={(e) => setCustomTheme({ ...customTheme, accent: e.target.value })}
                              className="w-12 h-10 rounded border border-theme-card cursor-pointer"
                            />
                            <input
                              type="text"
                              value={customTheme.accent || '#60a5fa'}
                              onChange={(e) => setCustomTheme({ ...customTheme, accent: e.target.value })}
                              className="flex-1 px-3 py-2 bg-theme-input border border-theme-input rounded text-theme-input text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Couleurs des composants */}
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-theme-card">Composants</h4>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-theme-statusbar mb-1">Carte - Fond</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={customTheme.card?.bg || '#1e293b'}
                              onChange={(e) => setCustomTheme({
                                ...customTheme,
                                card: { ...customTheme.card, bg: e.target.value } as Theme['colors']['card']
                              })}
                              className="w-12 h-10 rounded border border-theme-card cursor-pointer"
                            />
                            <input
                              type="text"
                              value={customTheme.card?.bg || '#1e293b'}
                              onChange={(e) => setCustomTheme({
                                ...customTheme,
                                card: { ...customTheme.card, bg: e.target.value } as Theme['colors']['card']
                              })}
                              className="flex-1 px-3 py-2 bg-theme-input border border-theme-input rounded text-theme-input text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-theme-statusbar mb-1">Sidebar - Fond</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={customTheme.sidebar?.bg || '#1e293b'}
                              onChange={(e) => setCustomTheme({
                                ...customTheme,
                                sidebar: { ...customTheme.sidebar, bg: e.target.value } as Theme['colors']['sidebar']
                              })}
                              className="w-12 h-10 rounded border border-theme-card cursor-pointer"
                            />
                            <input
                              type="text"
                              value={customTheme.sidebar?.bg || '#1e293b'}
                              onChange={(e) => setCustomTheme({
                                ...customTheme,
                                sidebar: { ...customTheme.sidebar, bg: e.target.value } as Theme['colors']['sidebar']
                              })}
                              className="flex-1 px-3 py-2 bg-theme-input border border-theme-input rounded text-theme-input text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-theme-statusbar mb-1">Input - Fond</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={customTheme.input?.bg || '#1e293b'}
                              onChange={(e) => setCustomTheme({
                                ...customTheme,
                                input: { ...customTheme.input, bg: e.target.value } as Theme['colors']['input']
                              })}
                              className="w-12 h-10 rounded border border-theme-card cursor-pointer"
                            />
                            <input
                              type="text"
                              value={customTheme.input?.bg || '#1e293b'}
                              onChange={(e) => setCustomTheme({
                                ...customTheme,
                                input: { ...customTheme.input, bg: e.target.value } as Theme['colors']['input']
                              })}
                              className="flex-1 px-3 py-2 bg-theme-input border border-theme-input rounded text-theme-input text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-theme-statusbar mb-1">Bouton - Primaire</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={customTheme.button?.primary || '#3b82f6'}
                              onChange={(e) => setCustomTheme({
                                ...customTheme,
                                button: { ...customTheme.button, primary: e.target.value } as Theme['colors']['button']
                              })}
                              className="w-12 h-10 rounded border border-theme-card cursor-pointer"
                            />
                            <input
                              type="text"
                              value={customTheme.button?.primary || '#3b82f6'}
                              onChange={(e) => setCustomTheme({
                                ...customTheme,
                                button: { ...customTheme.button, primary: e.target.value } as Theme['colors']['button']
                              })}
                              className="flex-1 px-3 py-2 bg-theme-input border border-theme-input rounded text-theme-input text-sm"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-theme-card">
                    <button
                      onClick={handleApplyCustomTheme}
                      className="flex items-center gap-2 px-4 py-2 bg-theme-primary hover:bg-theme-primary/90 rounded-lg text-white transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      Appliquer le thème personnalisé
                    </button>
                    <button
                      onClick={handleResetCustomTheme}
                      className="px-4 py-2 bg-theme-secondary hover:bg-theme-secondary/80 rounded-lg text-white transition-colors"
                    >
                      Réinitialiser
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;

