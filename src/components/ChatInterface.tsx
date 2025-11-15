import { useState, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Send, CheckCircle, AlertCircle, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  generateNextQuestion,
  generateSummary,
  generateRecommendation,
} from '../services/conversationService';
import type { Message } from '../lib/supabase';

type ConversationState = {
  symptom?: string;
  bodyLocation?: string;
  duration?: string;
  contextualInfo?: string;
  conversationPhase: 'initial' | 'symptom' | 'location' | 'duration' | 'context' | 'summary';
  requiresLocation: boolean;
};

export default function ChatInterface({ onComplete }: { onComplete: () => void }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I'm here to help you log your symptoms. What symptom are you experiencing?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationState, setConversationState] = useState<ConversationState>({
    conversationPhase: 'symptom',
    requiresLocation: false,
  });
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState('');
  const [recommendation, setRecommendation] = useState<{
    recommendation: string;
    urgencyLevel: 'low' | 'medium' | 'high' | 'urgent';
    advice: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      if (conversationState.conversationPhase === 'summary') {
        await finalizeSummary(userMessage.content);
        return;
      }

      const { message, newState } = await generateNextQuestion(
        conversationState,
        userMessage.content
      );

      const assistantMessage: Message = {
        role: 'assistant',
        content: message,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setConversationState(newState);
    } catch (error) {
      console.error('Error generating next question:', error);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            "I'm sorry, I'm having trouble generating the next question right now. Let's continue with a simple question: What other details about your symptom would you like to share?",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const finalizeSummary = async (additionalInfo: string) => {
    const optionalInfo = additionalInfo || undefined;
    const generatedSummary = await generateSummary(conversationState, optionalInfo);
    const rec = await generateRecommendation(conversationState, {
      summary: generatedSummary,
      additionalInfo: optionalInfo,
    });

    setSummary(generatedSummary);
    setRecommendation(rec);
    setShowSummary(true);
  };

  const confirmAndSave = async () => {
    if (!user) return;

    setLoading(true);

    try {
      const { data: symptomData, error: symptomError } = await supabase
        .from('symptoms')
        .insert({
          user_id: user.id,
          symptom_name: conversationState.symptom || '',
          body_location: conversationState.bodyLocation || null,
          duration: conversationState.duration || '',
          description: conversationState.contextualInfo || '',
          severity: recommendation?.urgencyLevel || 'low',
        })
        .select()
        .maybeSingle();

      if (symptomError) throw symptomError;

      if (symptomData) {
        const { error: conversationError } = await supabase.from('conversations').insert({
          user_id: user.id,
          symptom_id: symptomData.id,
          messages: messages,
          summary: summary,
          recommendation: recommendation?.recommendation || null,
          urgency_level: recommendation?.urgencyLevel || 'low',
          completed_at: new Date().toISOString(),
        });

        if (conversationError) throw conversationError;
      }

      onComplete();
    } catch (error) {
      console.error('Error saving symptom:', error);
      alert('There was an error saving your symptom. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getUrgencyColor = (level: string) => {
    switch (level) {
      case 'urgent':
        return 'text-red-600';
      case 'high':
        return 'text-orange-600';
      case 'medium':
        return 'text-yellow-600';
      default:
        return 'text-green-600';
    }
  };

  const getUrgencyIcon = (level: string) => {
    switch (level) {
      case 'urgent':
      case 'high':
        return <Phone className="w-5 h-5" />;
      case 'medium':
        return <AlertCircle className="w-5 h-5" />;
      default:
        return <CheckCircle className="w-5 h-5" />;
    }
  };

  if (showSummary) {
    return (
      <div className="flex flex-col h-full bg-white rounded-lg shadow-sm">
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Summary for Your Doctor</h2>

          <div className="prose prose-sm max-w-none mb-6">
            <div className="whitespace-pre-line text-gray-700 bg-gray-50 p-4 rounded-lg">
              {summary}
            </div>
          </div>

          {recommendation && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Recommendation</h3>
              <div className={`flex items-start gap-3 p-4 rounded-lg border-2 ${
                recommendation.urgencyLevel === 'urgent' ? 'border-red-200 bg-red-50' :
                recommendation.urgencyLevel === 'high' ? 'border-orange-200 bg-orange-50' :
                recommendation.urgencyLevel === 'medium' ? 'border-yellow-200 bg-yellow-50' :
                'border-green-200 bg-green-50'
              }`}>
                <div className={getUrgencyColor(recommendation.urgencyLevel)}>
                  {getUrgencyIcon(recommendation.urgencyLevel)}
                </div>
                <div className="flex-1">
                  <p className={`font-semibold mb-2 ${getUrgencyColor(recommendation.urgencyLevel)}`}>
                    {recommendation.recommendation}
                  </p>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    {recommendation.advice}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-sm text-gray-600 mb-4">
              Does this summary accurately reflect your symptoms? If yes, I'll save this to your health record.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmAndSave}
                disabled={loading}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Saving...' : 'Confirm & Save'}
              </button>
              <button
                onClick={() => setShowSummary(false)}
                disabled={loading}
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-line">{message.content}</p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl px-4 py-3">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your response..."
            disabled={loading}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
