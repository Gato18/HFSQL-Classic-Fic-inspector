import React from 'react';
import { CheckCircle2, AlertTriangle, Info, Copy, Database, Lightbulb, Shield } from 'lucide-react';
import toast from 'react-hot-toast';

interface AdvisorResponseProps {
  advice: {
    diagnostic?: any;
    actions_recommandees?: any;
    risques?: any;
    sql_suggere?: any;
    niveau_confiance: number;
    notes_complementaires?: any;
  };
}

// Fonction ultra robuste pour parser et formater les blocs de code markdown dans une chaîne
const parseMarkdownCodeBlocks = (text: string): React.ReactNode[] => {
  if (!text || typeof text !== 'string') {
    return [text];
  }

  const parts: React.ReactNode[] = [];
  // Regex améliorée pour capturer les blocs de code avec ou sans saut de ligne après ```
  // Supporte: ```json\n...``` ou ```json...``` ou ```\n...``` ou même ```json\n\n...\n\n```
  // Utilise une approche non-greedy mais avec protection contre les blocs imbriqués
  const codeBlockRegex = /```(\w+)?\s*\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;
  let matchCount = 0;
  const processedIndices = new Set<number>(); // Pour éviter de traiter deux fois le même bloc

  // Réinitialiser la regex pour éviter les problèmes avec exec
  codeBlockRegex.lastIndex = 0;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Éviter les doublons
    if (processedIndices.has(match.index)) {
      continue;
    }
    processedIndices.add(match.index);
    
    matchCount++;
    // Ajouter le texte avant le bloc de code
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      if (beforeText.trim()) {
        parts.push(
          <span key={`text-${matchCount}-${lastIndex}`} className="whitespace-pre-wrap">{beforeText}</span>
        );
      }
    }

    // Extraire le contenu du bloc de code
    const language = (match[1] || '').trim().toLowerCase();
    let codeContent = match[2].trim();

    // Nettoyer le contenu (enlever les retours à la ligne superflus au début/fin)
    codeContent = codeContent.replace(/^\n+/, '').replace(/\n+$/, '');

    // Si c'est du JSON, essayer de le formater de manière ultra robuste
    let formattedCode = codeContent;
    if (language === 'json' || (!language && (codeContent.startsWith('{') || codeContent.startsWith('[')))) {
      try {
        // Essayer de parser le JSON
        const parsed = JSON.parse(codeContent);
        formattedCode = JSON.stringify(parsed, null, 2);
      } catch (e) {
        // Si le parsing échoue, essayer de nettoyer et réessayer
        try {
          // Enlever les caractères non-JSON au début/fin
          let cleaned = codeContent.trim();
          // Enlever les espaces/retours à la ligne superflus
          cleaned = cleaned.replace(/^[\s\n\r]+/, '').replace(/[\s\n\r]+$/, '');
          if (cleaned !== codeContent) {
            const parsed = JSON.parse(cleaned);
            formattedCode = JSON.stringify(parsed, null, 2);
          }
        } catch (e2) {
          // Si ça échoue encore, garder le contenu original mais formaté
          formattedCode = codeContent;
        }
      }
    }

    // Ajouter le bloc de code formaté
    parts.push(
      <div key={`code-${matchCount}-${match.index}`} className="my-2 bg-theme-input rounded-lg p-3 border border-theme-input">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-theme-statusbar opacity-70">
            {language ? `Code ${language.toUpperCase()}` : 'Code'}
          </span>
          <button
            onClick={() => {
              navigator.clipboard.writeText(codeContent);
              toast.success('Code copié dans le presse-papiers');
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-theme-secondary rounded text-white transition-colors hover:bg-theme-secondary/80"
          >
            <Copy className="w-3 h-3" />
            Copier
          </button>
        </div>
        <pre className="text-xs bg-theme-background rounded p-2 overflow-x-auto text-theme-foreground font-mono whitespace-pre-wrap">
          {formattedCode}
        </pre>
      </div>
    );

    lastIndex = match.index + match[0].length;
  }

  // Ajouter le texte restant après le dernier bloc de code
  if (lastIndex < text.length) {
    const remainingText = text.substring(lastIndex);
    if (remainingText.trim()) {
      parts.push(
        <span key={`text-end-${lastIndex}`} className="whitespace-pre-wrap">{remainingText}</span>
      );
    }
  }

  // Si aucun bloc de code n'a été trouvé, retourner le texte original
  if (parts.length === 0) {
    return [<span key="text-only" className="whitespace-pre-wrap">{text}</span>];
  }

  return parts;
};

const AdvisorResponse: React.FC<AdvisorResponseProps> = ({ advice }) => {
  // Debug: logger toutes les données reçues au niveau du composant
  console.log('🎯 AdvisorResponse reçoit:', {
    advice,
    diagnostic: advice.diagnostic,
    actions_recommandees: advice.actions_recommandees,
    risques: advice.risques,
    sql_suggere: advice.sql_suggere,
    actionsType: typeof advice.actions_recommandees,
    actionsIsArray: Array.isArray(advice.actions_recommandees),
    actionsLength: Array.isArray(advice.actions_recommandees) ? advice.actions_recommandees.length : 'N/A',
    risquesType: typeof advice.risques,
    risquesIsArray: Array.isArray(advice.risques),
    risquesLength: Array.isArray(advice.risques) ? advice.risques.length : 'N/A',
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copié dans le presse-papiers');
  };

  // Fonction ultra robuste pour parser une valeur qui pourrait être une chaîne JSON
  const tryParseJson = (value: any): any => {
    if (typeof value !== 'string') {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return value;
    }

    // 1. Essayer de détecter et extraire TOUS les blocs JSON markdown (```json ... ```)
    const jsonBlockRegex = /```json\s*\n?([\s\S]*?)```/gi;
    const jsonBlocks: string[] = [];
    let match;
    let cleanedText = trimmed;
    
    // Extraire tous les blocs JSON
    while ((match = jsonBlockRegex.exec(trimmed)) !== null) {
      const jsonContent = match[1].trim();
      if (jsonContent) {
        jsonBlocks.push(jsonContent);
        // Remplacer le bloc markdown par un placeholder temporaire
        cleanedText = cleanedText.replace(match[0], `__JSON_BLOCK_${jsonBlocks.length - 1}__`);
      }
    }

    // Si on a trouvé des blocs JSON, essayer de les parser
    if (jsonBlocks.length > 0) {
      // Essayer de parser le premier bloc (généralement le plus important)
      for (const jsonBlock of jsonBlocks) {
        try {
          const parsed = JSON.parse(jsonBlock);
          // Si le parsing réussit, retourner l'objet parsé
          return parsed;
        } catch (e) {
          // Continuer avec le bloc suivant
          continue;
        }
      }
    }

    // 2. Essayer de détecter un JSON brut (sans markdown) au début ou à la fin
    // Chercher un objet ou tableau JSON valide
    const jsonPatterns = [
      /^[\s\n]*(\{[\s\S]*\})[\s\n]*$/,  // Objet JSON complet
      /^[\s\n]*(\[[\s\S]*\])[\s\n]*$/,  // Tableau JSON complet
      /(\{[\s\S]{20,}\})/,              // Objet JSON (au moins 20 caractères)
      /(\[[\s\S]{20,}\])/,              // Tableau JSON (au moins 20 caractères)
    ];

    for (const pattern of jsonPatterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        try {
          const parsed = JSON.parse(match[1]);
          return parsed;
        } catch (e) {
          // Continuer avec le pattern suivant
          continue;
        }
      }
    }

    // 3. Si la chaîne commence et se termine par { } ou [ ], essayer de parser directement
    const firstChar = trimmed[0];
    const lastChar = trimmed[trimmed.length - 1];
    if (
      (firstChar === '{' && lastChar === '}') ||
      (firstChar === '[' && lastChar === ']')
    ) {
      try {
        return JSON.parse(trimmed);
      } catch (e) {
        // Si le parsing échoue, essayer de nettoyer la chaîne
        // Enlever les caractères non-JSON au début/fin
        let cleaned = trimmed;
        // Enlever les espaces et retours à la ligne au début/fin
        cleaned = cleaned.replace(/^[\s\n\r]+/, '').replace(/[\s\n\r]+$/, '');
        if (cleaned !== trimmed) {
          try {
            return JSON.parse(cleaned);
          } catch (e2) {
            // Ignorer
          }
        }
      }
    }

    // 4. Si rien n'a fonctionné, retourner la valeur originale
    return value;
  };

  // Fonction pour nettoyer une chaîne en enlevant les blocs markdown JSON
  const cleanMarkdownJsonBlocks = (text: string): string => {
    if (typeof text !== 'string') {
      return text;
    }

    // Remplacer tous les blocs ```json ... ``` par du texte lisible
    return text.replace(/```json\s*\n?([\s\S]*?)```/gi, (_match, jsonContent) => {
      try {
        // Essayer de parser et reformater le JSON
        const parsed = JSON.parse(jsonContent.trim());
        const formatted = JSON.stringify(parsed, null, 2);
        // Retourner une version lisible sans les backticks
        return `\n[Données JSON formatées]\n${formatted}\n`;
      } catch (e) {
        // Si le parsing échoue, retourner juste le contenu sans les backticks
        return `\n${jsonContent.trim()}\n`;
      }
    });
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.7) {
      return (
        <span className="px-2 py-1 text-xs rounded bg-green-500/20 text-green-400 border border-green-500/50">
          Confiance élevée
        </span>
      );
    } else if (confidence >= 0.4) {
      return (
        <span className="px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/50">
          Confiance moyenne
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400 border border-red-500/50">
          Confiance faible
        </span>
      );
    }
  };

  const renderDiagnostic = (diagnostic: any) => {
    if (!diagnostic) {
      return <p className="text-sm text-theme-statusbar opacity-50 italic">Aucun diagnostic disponible</p>;
    }

    // Essayer de parser si c'est une chaîne JSON
    let parsedDiagnostic = diagnostic;
    if (typeof diagnostic === 'string') {
      const parsed = tryParseJson(diagnostic);
      if (parsed !== diagnostic && typeof parsed === 'object' && parsed !== null) {
        parsedDiagnostic = parsed;
      } else {
        // Si ce n'est pas du JSON, nettoyer les blocs markdown et afficher comme texte
        if (diagnostic.trim() === '') {
          return <p className="text-sm text-theme-statusbar opacity-50 italic">Diagnostic vide</p>;
        }
        // Nettoyer les blocs JSON markdown avant d'afficher
        const cleanedDiagnostic = cleanMarkdownJsonBlocks(diagnostic);
        return (
          <div className="text-sm text-theme-statusbar space-y-2">
            {parseMarkdownCodeBlocks(cleanedDiagnostic)}
          </div>
        );
      }
    }

    if (typeof parsedDiagnostic === 'object' && parsedDiagnostic !== null) {
      const hasContent = 
        (parsedDiagnostic.etat_actuel && typeof parsedDiagnostic.etat_actuel === 'string' && parsedDiagnostic.etat_actuel.trim() !== '') ||
        (Array.isArray(parsedDiagnostic.hypotheses) && parsedDiagnostic.hypotheses.length > 0) ||
        (Array.isArray(parsedDiagnostic.verifications_prealables) && parsedDiagnostic.verifications_prealables.length > 0);

      if (!hasContent) {
        return <p className="text-sm text-theme-statusbar opacity-50 italic">Diagnostic structuré mais vide</p>;
      }

      return (
        <div className="space-y-3">
          {parsedDiagnostic.etat_actuel && typeof parsedDiagnostic.etat_actuel === 'string' && parsedDiagnostic.etat_actuel.trim() !== '' && (
            <div>
              <h5 className="text-xs font-semibold text-theme-card mb-1">État actuel</h5>
              <div className="text-sm text-theme-statusbar space-y-2">
                {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(parsedDiagnostic.etat_actuel))}
              </div>
            </div>
          )}
          {parsedDiagnostic.hypotheses && Array.isArray(parsedDiagnostic.hypotheses) && parsedDiagnostic.hypotheses.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-theme-card mb-1">Hypothèses</h5>
              <ul className="list-disc list-inside space-y-2 text-sm text-theme-statusbar">
                {parsedDiagnostic.hypotheses.map((hyp: string, idx: number) => (
                  <li key={idx}>
                    <div className="space-y-2">
                      {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(hyp)))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {parsedDiagnostic.verifications_prealables && Array.isArray(parsedDiagnostic.verifications_prealables) && parsedDiagnostic.verifications_prealables.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-theme-card mb-1">Vérifications préalables</h5>
              <ul className="list-disc list-inside space-y-2 text-sm text-theme-statusbar">
                {parsedDiagnostic.verifications_prealables.map((verif: string, idx: number) => (
                  <li key={idx}>
                    <div className="space-y-2">
                      {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(verif)))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      );
    }

    return <p className="text-sm text-theme-statusbar opacity-50 italic">Format de diagnostic inattendu</p>;
  };

  const renderActions = (actions: any) => {
    // Debug complet
    console.log('🔍 renderActions appelé avec:', {
      actions,
      type: typeof actions,
      isArray: Array.isArray(actions),
      isNull: actions === null,
      isUndefined: actions === undefined,
      length: Array.isArray(actions) ? actions.length : 'N/A',
      firstItem: Array.isArray(actions) && actions.length > 0 ? actions[0] : null
    });

    if (!actions || actions === null || actions === undefined) {
      console.log('❌ Actions est null/undefined');
      return <p className="text-sm text-theme-statusbar opacity-50 italic">Aucune action recommandée</p>;
    }

    // Si c'est déjà un tableau, l'utiliser directement
    if (Array.isArray(actions)) {
      console.log('✅ Actions est déjà un tableau avec', actions.length, 'éléments');
      if (actions.length === 0) {
        return <p className="text-sm text-theme-statusbar opacity-50 italic">Aucune action recommandée</p>;
      }
      // Vérifier si c'est un tableau d'objets ou de strings
      if (actions.length > 0 && typeof actions[0] === 'object' && actions[0] !== null) {
        return (
          <div className="space-y-2">
            {actions.map((action: any, idx: number) => (
              <div key={idx} className="bg-theme-card/30 rounded-lg p-3 border border-theme-card">
                <div className="flex items-start justify-between mb-2">
                  <h5 className="text-sm font-semibold text-theme-card">{action.action || `Action ${idx + 1}`}</h5>
                  {action.priorite && (
                    <span className={`text-xs px-2 py-1 rounded ${
                      action.priorite === 'critique' || action.priorite === 'haute' ? 'bg-red-500/20 text-red-400' :
                      action.priorite === 'moyenne' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {action.priorite}
                    </span>
                  )}
                </div>
                {action.details && (
                  <div className="text-xs text-theme-statusbar">
                    {Array.isArray(action.details) ? (
                      <ul className="list-disc list-inside space-y-1 mt-1">
                        {action.details.map((detail: string, dIdx: number) => (
                          <li key={dIdx}>
                            {typeof detail === 'string' ? (
                              <div className="space-y-2">{parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(detail))}</div>
                            ) : (
                              detail
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="space-y-2">
                        {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(action.details)))}
                      </div>
                    )}
                  </div>
                )}
                {action.dependances && Array.isArray(action.dependances) && action.dependances.length > 0 && (
                  <div className="mt-2 text-xs text-theme-secondary">
                    <span className="font-semibold">Dépendances:</span> {action.dependances.join(', ')}
                  </div>
                )}
                {action.outils && Array.isArray(action.outils) && action.outils.length > 0 && (
                  <div className="mt-2 text-xs text-theme-secondary">
                    <span className="font-semibold">Outils:</span> {action.outils.join(', ')}
                  </div>
                )}
                {action.exemple_sql && (
                  <div className="mt-2 text-xs">
                    <span className="font-semibold text-theme-card">Exemple SQL:</span>
                    <pre className="mt-1 bg-theme-background rounded p-2 overflow-x-auto font-mono">
                      {action.exemple_sql}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      } else {
        // Tableau de strings
        return (
          <ul className="list-disc list-inside space-y-2 text-sm text-theme-statusbar">
            {actions.map((action: string, idx: number) => (
              <li key={idx}>
                <div className="space-y-2">
                  {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(action)))}
                </div>
              </li>
            ))}
          </ul>
        );
      }
    }

    // Essayer de parser si c'est une chaîne JSON (ultra robuste)
    let parsedActions = actions;
    if (typeof actions === 'string') {
      console.log('📝 Actions est une chaîne, tentative de parsing...');
      // Nettoyer d'abord les blocs markdown JSON
      const cleaned = cleanMarkdownJsonBlocks(actions);
      // Puis essayer de parser
      parsedActions = tryParseJson(cleaned);
      console.log('📝 Après parsing:', { parsedActions, isArray: Array.isArray(parsedActions) });
    }
    
    // Si ce n'est toujours pas un tableau après parsing, retourner un message
    if (!Array.isArray(parsedActions)) {
      // Dernière tentative : si c'est un objet avec une propriété qui est un tableau
      if (typeof parsedActions === 'object' && parsedActions !== null) {
        console.log('🔍 ParsedActions est un objet, recherche de propriétés tableaux...');
        // Chercher une propriété qui pourrait être le tableau d'actions
        for (const key in parsedActions) {
          if (Array.isArray(parsedActions[key])) {
            console.log('✅ Trouvé une propriété tableau:', key);
            parsedActions = parsedActions[key];
            break;
          }
        }
      }
      
      if (!Array.isArray(parsedActions)) {
        console.warn('❌ Actions recommandées: format inattendu', { 
          original: actions, 
          parsed: parsedActions, 
          type: typeof parsedActions,
          keys: typeof parsedActions === 'object' && parsedActions !== null ? Object.keys(parsedActions) : 'N/A'
        });
        return <p className="text-sm text-theme-statusbar opacity-50 italic">Format d'actions non reconnu</p>;
      }
    }
    
    // Si on arrive ici, parsedActions est un tableau
    if (parsedActions.length === 0) {
      return <p className="text-sm text-theme-statusbar opacity-50 italic">Aucune action recommandée</p>;
    }

    // Vérifier si c'est un tableau d'objets ou de strings
    if (parsedActions.length > 0 && typeof parsedActions[0] === 'object' && parsedActions[0] !== null) {
      return (
        <div className="space-y-2">
          {parsedActions.map((action: any, idx: number) => (
            <div key={idx} className="bg-theme-card/30 rounded-lg p-3 border border-theme-card">
              <div className="flex items-start justify-between mb-2">
                <h5 className="text-sm font-semibold text-theme-card">{action.action || `Action ${idx + 1}`}</h5>
                {action.priorite && (
                  <span className={`text-xs px-2 py-1 rounded ${
                    action.priorite === 'critique' || action.priorite === 'haute' ? 'bg-red-500/20 text-red-400' :
                    action.priorite === 'moyenne' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {action.priorite}
                  </span>
                )}
              </div>
              {action.details && (
                <div className="text-xs text-theme-statusbar">
                  {Array.isArray(action.details) ? (
                    <ul className="list-disc list-inside space-y-1 mt-1">
                      {action.details.map((detail: string, dIdx: number) => (
                        <li key={dIdx}>
                          {typeof detail === 'string' ? (
                            <div className="space-y-2">{parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(detail))}</div>
                          ) : (
                            detail
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="space-y-2">
                      {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(action.details)))}
                    </div>
                  )}
                </div>
              )}
              {action.dependances && Array.isArray(action.dependances) && action.dependances.length > 0 && (
                <div className="mt-2 text-xs text-theme-secondary">
                  <span className="font-semibold">Dépendances:</span> {action.dependances.join(', ')}
                </div>
              )}
              {action.outils && Array.isArray(action.outils) && action.outils.length > 0 && (
                <div className="mt-2 text-xs text-theme-secondary">
                  <span className="font-semibold">Outils:</span> {action.outils.join(', ')}
                </div>
              )}
              {action.exemple_sql && (
                <div className="mt-2 text-xs">
                  <span className="font-semibold text-theme-card">Exemple SQL:</span>
                  <pre className="mt-1 bg-theme-background rounded p-2 overflow-x-auto font-mono">
                    {action.exemple_sql}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      );
    } else {
      // Tableau de strings
      return (
        <ul className="list-disc list-inside space-y-2 text-sm text-theme-statusbar">
          {parsedActions.map((action: string, idx: number) => (
            <li key={idx}>
              <div className="space-y-2">
                {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(action)))}
              </div>
            </li>
          ))}
        </ul>
      );
    }
  };

  const renderRisques = (risques: any) => {
    // Debug complet
    console.log('🔍 renderRisques appelé avec:', {
      risques,
      type: typeof risques,
      isArray: Array.isArray(risques),
      isNull: risques === null,
      isUndefined: risques === undefined,
      length: Array.isArray(risques) ? risques.length : 'N/A',
      firstItem: Array.isArray(risques) && risques.length > 0 ? risques[0] : null
    });

    if (!risques || risques === null || risques === undefined) {
      console.log('❌ Risques est null/undefined');
      return <p className="text-sm text-red-300 opacity-50 italic">Aucun risque identifié</p>;
    }

    // Si c'est déjà un tableau, l'utiliser directement
    if (Array.isArray(risques)) {
      console.log('✅ Risques est déjà un tableau avec', risques.length, 'éléments');
      if (risques.length === 0) {
        return <p className="text-sm text-red-300 opacity-50 italic">Aucun risque identifié</p>;
      }

      // Vérifier si c'est un tableau d'objets ou de strings
      if (risques.length > 0 && typeof risques[0] === 'object' && risques[0] !== null) {
        return (
          <div className="space-y-2">
            {risques.map((risque: any, idx: number) => (
              <div key={idx} className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
                <h5 className="text-sm font-semibold text-red-400 mb-2">{risque.risque || `Risque ${idx + 1}`}</h5>
                <div className="space-y-2 text-xs text-red-300">
                  {risque.cause && (
                    <div>
                      <span className="font-semibold">Cause:</span>
                      <div className="mt-1 space-y-2">
                        {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(risque.cause)))}
                      </div>
                    </div>
                  )}
                  {risque.impact && (
                    <div>
                      <span className="font-semibold">Impact:</span>
                      <div className="mt-1 space-y-2">
                        {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(risque.impact)))}
                      </div>
                    </div>
                  )}
                  {risque.mitigation && (
                    <div>
                      <span className="font-semibold">Mitigation:</span>
                      <div className="mt-1 space-y-2">
                        {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(risque.mitigation)))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      } else {
        // Tableau de strings
        return (
          <ul className="list-disc list-inside space-y-2 text-sm text-red-300">
            {risques.map((risque: string, idx: number) => (
              <li key={idx}>
                <div className="space-y-2">
                  {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(risque)))}
                </div>
              </li>
            ))}
          </ul>
        );
      }
    }

    // Essayer de parser si c'est une chaîne JSON (ultra robuste)
    let parsedRisques = risques;
    if (typeof risques === 'string') {
      console.log('📝 Risques est une chaîne, tentative de parsing...');
      // Nettoyer d'abord les blocs markdown JSON
      const cleaned = cleanMarkdownJsonBlocks(risques);
      // Puis essayer de parser
      parsedRisques = tryParseJson(cleaned);
      console.log('📝 Après parsing:', { parsedRisques, isArray: Array.isArray(parsedRisques) });
    }
    
    // Si ce n'est toujours pas un tableau après parsing, retourner un message
    if (!Array.isArray(parsedRisques)) {
      // Dernière tentative : si c'est un objet avec une propriété qui est un tableau
      if (typeof parsedRisques === 'object' && parsedRisques !== null) {
        console.log('🔍 ParsedRisques est un objet, recherche de propriétés tableaux...');
        // Chercher une propriété qui pourrait être le tableau de risques
        for (const key in parsedRisques) {
          if (Array.isArray(parsedRisques[key])) {
            console.log('✅ Trouvé une propriété tableau:', key);
            parsedRisques = parsedRisques[key];
            break;
          }
        }
      }
      
      if (!Array.isArray(parsedRisques)) {
        console.warn('❌ Risques: format inattendu', { 
          original: risques, 
          parsed: parsedRisques, 
          type: typeof parsedRisques,
          keys: typeof parsedRisques === 'object' && parsedRisques !== null ? Object.keys(parsedRisques) : 'N/A'
        });
        return <p className="text-sm text-red-300 opacity-50 italic">Format de risques non reconnu</p>;
      }
    }
    
    if (Array.isArray(parsedRisques)) {
      if (parsedRisques.length === 0) {
        return <p className="text-sm text-red-300 opacity-50 italic">Aucun risque identifié</p>;
      }

      // Vérifier si c'est un tableau d'objets ou de strings
      if (parsedRisques.length > 0 && typeof parsedRisques[0] === 'object' && parsedRisques[0] !== null) {
        return (
          <div className="space-y-2">
            {parsedRisques.map((risque: any, idx: number) => (
              <div key={idx} className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
                <h5 className="text-sm font-semibold text-red-400 mb-2">{risque.risque || `Risque ${idx + 1}`}</h5>
                <div className="space-y-2 text-xs text-red-300">
                  {risque.cause && (
                    <div>
                      <span className="font-semibold">Cause:</span>
                      <div className="mt-1 space-y-2">
                        {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(risque.cause)))}
                      </div>
                    </div>
                  )}
                  {risque.impact && (
                    <div>
                      <span className="font-semibold">Impact:</span>
                      <div className="mt-1 space-y-2">
                        {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(risque.impact)))}
                      </div>
                    </div>
                  )}
                  {risque.mitigation && (
                    <div>
                      <span className="font-semibold">Mitigation:</span>
                      <div className="mt-1 space-y-2">
                        {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(risque.mitigation)))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      } else {
        // Tableau de strings
        return (
          <ul className="list-disc list-inside space-y-2 text-sm text-red-300">
            {parsedRisques.map((risque: string, idx: number) => (
              <li key={idx}>
                <div className="space-y-2">
                  {parseMarkdownCodeBlocks(cleanMarkdownJsonBlocks(String(risque)))}
                </div>
              </li>
            ))}
          </ul>
        );
      }
    }

    return null;
  };

  const renderSql = (sql: any) => {
    if (!sql) return null;

    if (typeof sql === 'string') {
      return (
        <div className="bg-theme-input rounded-lg p-3 border border-theme-input">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-theme-primary" />
              <h4 className="text-sm font-semibold text-theme-statusbar">SQL suggéré</h4>
            </div>
            <button
              onClick={() => copyToClipboard(sql)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-theme-secondary rounded text-white transition-colors hover:bg-theme-secondary/80"
            >
              <Copy className="w-3 h-3" />
              Copier
            </button>
          </div>
          <pre className="text-xs bg-theme-background rounded p-2 overflow-x-auto text-theme-foreground font-mono">
            {sql}
          </pre>
          <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            Ne jamais exécuter automatiquement ce SQL
          </p>
        </div>
      );
    }

    if (Array.isArray(sql)) {
      return (
        <div className="space-y-3">
          {sql.map((item: any, idx: number) => (
            <div key={idx} className="bg-theme-input rounded-lg p-3 border border-theme-input">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-theme-primary" />
                  <h4 className="text-sm font-semibold text-theme-statusbar">
                    {item.description || `Requête SQL ${idx + 1}`}
                  </h4>
                </div>
                {item.requete && (
                  <button
                    onClick={() => copyToClipboard(item.requete)}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-theme-secondary rounded text-white transition-colors hover:bg-theme-secondary/80"
                  >
                    <Copy className="w-3 h-3" />
                    Copier
                  </button>
                )}
              </div>
              {item.requete && (
                <>
                  <pre className="text-xs bg-theme-background rounded p-2 overflow-x-auto text-theme-foreground font-mono">
                    {item.requete}
                  </pre>
                  <p className="text-xs text-yellow-400 mt-2 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Ne jamais exécuter automatiquement ce SQL
                  </p>
                </>
              )}
            </div>
          ))}
        </div>
      );
    }

    return null;
  };

  // Vérifier si on a des données à afficher (en tenant compte des chaînes JSON)
  const hasAnyData = (() => {
    // Vérifier le diagnostic
    if (advice.diagnostic !== undefined && advice.diagnostic !== null) {
      let parsedDiag = advice.diagnostic;
      if (typeof advice.diagnostic === 'string') {
        parsedDiag = tryParseJson(advice.diagnostic);
      }
      if (parsedDiag && (typeof parsedDiag === 'object' || typeof parsedDiag === 'string')) {
        return true;
      }
    }
    
    // Vérifier les actions - vérifier d'abord si c'est déjà un tableau
    if (advice.actions_recommandees !== undefined && advice.actions_recommandees !== null) {
      if (Array.isArray(advice.actions_recommandees) && advice.actions_recommandees.length > 0) {
        return true;
      }
      // Si c'est une chaîne, essayer de parser
      if (typeof advice.actions_recommandees === 'string') {
        const parsedActions = tryParseJson(advice.actions_recommandees);
        if (Array.isArray(parsedActions) && parsedActions.length > 0) {
          return true;
        }
      }
    }
    
    // Vérifier les risques - vérifier d'abord si c'est déjà un tableau
    if (advice.risques !== undefined && advice.risques !== null) {
      if (Array.isArray(advice.risques) && advice.risques.length > 0) {
        return true;
      }
      // Si c'est une chaîne, essayer de parser
      if (typeof advice.risques === 'string') {
        const parsedRisques = tryParseJson(advice.risques);
        if (Array.isArray(parsedRisques) && parsedRisques.length > 0) {
          return true;
        }
      }
    }
    
    // Vérifier le SQL
    if (advice.sql_suggere !== undefined && advice.sql_suggere !== null) {
      return true;
    }
    
    return false;
  })();

  if (!hasAnyData) {
    return (
      <div className="space-y-4 border-t border-theme-card pt-4">
        <div className="bg-yellow-500/10 rounded-lg p-4 border border-yellow-500/30">
          <p className="text-sm text-yellow-400">
            ⚠️ La réponse de l'IA ne contient pas de données structurées. Vérifiez les logs de la console pour plus de détails.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 border-t border-theme-card pt-4">
      {/* Diagnostic */}
      {(advice.diagnostic !== undefined && advice.diagnostic !== null) && (
        <div className="bg-blue-500/10 rounded-lg p-4 border border-blue-500/30">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-5 h-5 text-blue-400" />
            <h4 className="text-sm font-semibold text-blue-400">Diagnostic</h4>
          </div>
          {renderDiagnostic(advice.diagnostic)}
        </div>
      )}

      {/* Actions recommandées */}
      {(advice.actions_recommandees !== undefined && advice.actions_recommandees !== null) && (
        <div className="bg-green-500/10 rounded-lg p-4 border border-green-500/30">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <h4 className="text-sm font-semibold text-green-400">Actions recommandées</h4>
          </div>
          {renderActions(advice.actions_recommandees)}
        </div>
      )}

      {/* Risques */}
      {(advice.risques !== undefined && advice.risques !== null) && (
        <div className="bg-red-500/10 rounded-lg p-4 border border-red-500/30">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-red-400" />
            <h4 className="text-sm font-semibold text-red-400">Risques</h4>
          </div>
          {renderRisques(advice.risques)}
        </div>
      )}

      {/* SQL suggéré */}
      {advice.sql_suggere && renderSql(advice.sql_suggere)}

      {/* Notes complémentaires */}
      {advice.notes_complementaires && typeof advice.notes_complementaires === 'object' && (
        <div className="bg-theme-card/50 rounded-lg p-4 border border-theme-card">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-5 h-5 text-theme-primary" />
            <h4 className="text-sm font-semibold text-theme-card">Notes complémentaires</h4>
          </div>
          <div className="space-y-3 text-sm text-theme-statusbar">
            {advice.notes_complementaires.outils_recommandes && Array.isArray(advice.notes_complementaires.outils_recommandes) && (
              <div>
                <h5 className="text-xs font-semibold text-theme-card mb-1">Outils recommandés</h5>
                <ul className="list-disc list-inside space-y-1">
                  {advice.notes_complementaires.outils_recommandes.map((outil: string, idx: number) => (
                    <li key={idx}>{outil}</li>
                  ))}
                </ul>
              </div>
            )}
            {advice.notes_complementaires.bonnes_pratiques && Array.isArray(advice.notes_complementaires.bonnes_pratiques) && (
              <div>
                <h5 className="text-xs font-semibold text-theme-card mb-1">Bonnes pratiques</h5>
                <ul className="list-disc list-inside space-y-1">
                  {advice.notes_complementaires.bonnes_pratiques.map((pratique: string, idx: number) => (
                    <li key={idx}>{pratique}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Badge de confiance */}
      <div className="flex items-center justify-end">
        {getConfidenceBadge(advice.niveau_confiance)}
      </div>
    </div>
  );
};

export default AdvisorResponse;


