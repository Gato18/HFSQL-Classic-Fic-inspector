import React, { useState, useEffect } from 'react';
import { X, Trash2, MessageSquare, Clock, Database } from 'lucide-react';
import { Conversation, conversationService } from '../services/conversationService';
import toast from 'react-hot-toast';

interface ConversationHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadConversation: (conversation: Conversation) => void;
  currentConversationId?: string;
}

const ConversationHistory: React.FC<ConversationHistoryProps> = ({
  isOpen,
  onClose,
  onLoadConversation,
  currentConversationId,
}) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen]);

  const loadConversations = () => {
    const allConversations = conversationService.getAll();
    setConversations(allConversations);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette conversation ?')) {
      const success = conversationService.delete(id);
      if (success) {
        toast.success('Conversation supprimée');
        loadConversations();
      } else {
        toast.error('Erreur lors de la suppression');
      }
    }
  };

  const handleLoad = (conversation: Conversation) => {
    onLoadConversation(conversation);
    onClose();
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      if (hours === 0) {
        const minutes = Math.floor(diff / (1000 * 60));
        return `Il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
      }
      return `Il y a ${hours} heure${hours > 1 ? 's' : ''}`;
    } else if (days === 1) {
      return 'Hier';
    } else if (days < 7) {
      return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
    } else {
      return date.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    }
  };

  const filteredConversations = conversations.filter(conv =>
    conv.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    conv.dsn.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-theme-background border border-theme-border rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-theme-border">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-theme-primary" />
            <h2 className="text-lg font-semibold text-theme-foreground">Historique des conversations</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-theme-input transition-colors"
            title="Fermer"
          >
            <X className="w-5 h-5 text-theme-statusbar" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-theme-border">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Rechercher une conversation..."
            className="w-full px-3 py-2 bg-theme-input border border-theme-input rounded text-theme-input placeholder-theme-input focus:outline-none focus:ring-2 ring-theme-focus"
          />
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-theme-secondary">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">
                {searchTerm ? 'Aucune conversation trouvée' : 'Aucune conversation sauvegardée'}
              </p>
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => handleLoad(conversation)}
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  conversation.id === currentConversationId
                    ? 'bg-theme-primary/20 border-theme-primary'
                    : 'bg-theme-input border-theme-input hover:bg-theme-input/80'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-theme-foreground mb-1 truncate">
                      {conversation.title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-theme-statusbar">
                      <div className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        <span>{conversation.dsn}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(conversation.updatedAt)}</span>
                      </div>
                      <span>{conversation.messages.length} message{conversation.messages.length > 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDelete(conversation.id, e)}
                    className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-colors flex-shrink-0"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ConversationHistory;

