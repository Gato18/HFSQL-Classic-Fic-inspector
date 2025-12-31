/**
 * Service de gestion des conversations sauvegardées
 * 
 * Permet de sauvegarder, charger et supprimer les conversations avec l'IA
 */

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  advice?: {
    diagnostic: any;
    actions_recommandees: any;
    risques: any;
    sql_suggere?: any;
    niveau_confiance: number;
    notes_complementaires?: any;
  };
}

export interface Conversation {
  id: string;
  title: string;
  dsn: string;
  mode: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

const STORAGE_KEY = 'fic_inspector_conversations';
const MAX_CONVERSATIONS = 100; // Limite de conversations sauvegardées

class ConversationService {
  /**
   * Récupère toutes les conversations sauvegardées
   */
  getAll(): Conversation[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return [];
      
      const conversations = JSON.parse(stored) as Conversation[];
      // Convertir les dates string en objets Date
      return conversations.map(conv => ({
        ...conv,
        createdAt: new Date(conv.createdAt),
        updatedAt: new Date(conv.updatedAt),
        messages: conv.messages.map(msg => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
        })),
      }));
    } catch (error) {
      console.error('Erreur lors de la lecture des conversations:', error);
      return [];
    }
  }

  /**
   * Récupère une conversation par son ID
   */
  getById(id: string): Conversation | null {
    const conversations = this.getAll();
    return conversations.find(conv => conv.id === id) || null;
  }

  /**
   * Sauvegarde une conversation
   */
  save(conversation: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>): Conversation {
    const conversations = this.getAll();
    
    // Générer un ID unique
    const id = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();
    
    const newConversation: Conversation = {
      ...conversation,
      id,
      createdAt: now,
      updatedAt: now,
    };

    // Ajouter au début de la liste
    conversations.unshift(newConversation);

    // Limiter le nombre de conversations
    const limitedConversations = conversations.slice(0, MAX_CONVERSATIONS);

    // Sauvegarder
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(limitedConversations));
      return newConversation;
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de la conversation:', error);
      throw error;
    }
  }

  /**
   * Met à jour une conversation existante
   */
  update(id: string, updates: Partial<Omit<Conversation, 'id' | 'createdAt'>>): Conversation | null {
    const conversations = this.getAll();
    const index = conversations.findIndex(conv => conv.id === id);
    
    if (index === -1) {
      return null;
    }

    const updated: Conversation = {
      ...conversations[index],
      ...updates,
      updatedAt: new Date(),
    };

    conversations[index] = updated;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
      return updated;
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la conversation:', error);
      throw error;
    }
  }

  /**
   * Supprime une conversation
   */
  delete(id: string): boolean {
    const conversations = this.getAll();
    const filtered = conversations.filter(conv => conv.id !== id);
    
    if (filtered.length === conversations.length) {
      return false; // Conversation non trouvée
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      return true;
    } catch (error) {
      console.error('Erreur lors de la suppression de la conversation:', error);
      return false;
    }
  }

  /**
   * Génère un titre automatique à partir des premiers messages
   */
  generateTitle(messages: Message[]): string {
    if (messages.length === 0) {
      return 'Nouvelle conversation';
    }

    // Prendre la première question de l'utilisateur
    const firstUserMessage = messages.find(msg => msg.role === 'user');
    if (firstUserMessage) {
      const content = firstUserMessage.content.trim();
      // Limiter à 50 caractères
      if (content.length <= 50) {
        return content;
      }
      return content.substring(0, 47) + '...';
    }

    return 'Nouvelle conversation';
  }

  /**
   * Ajoute un message à une conversation existante
   */
  addMessage(conversationId: string, message: Message): Conversation | null {
    const conversation = this.getById(conversationId);
    if (!conversation) {
      return null;
    }

    const updatedMessages = [...conversation.messages, message];
    const updatedTitle = conversation.title || this.generateTitle(updatedMessages);

    return this.update(conversationId, {
      messages: updatedMessages,
      title: updatedTitle,
    });
  }
}

export const conversationService = new ConversationService();
export default conversationService;

