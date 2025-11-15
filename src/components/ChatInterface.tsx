import { useState, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Send, CheckCircle, AlertCircle, Phone, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  generateNextQuestion,
  generateSummary,
  generateRecommendation,
  generateRelatedSymptomInsight,
} from '../services/conversationService';
import type { Message, Symptom } from '../lib/supabase';
import type {
  ConversationState,
  RelatedSymptomInsight,
} from '../services/conversationService';

type EditableFieldKey = 'symptom' | 'bodyLocation' | 'duration' | 'contextualInfo' | 'severity';

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
  const [relatedSymptoms, setRelatedSymptoms] = useState<Symptom[]>([]);
  const [relatedInsight, setRelatedInsight] = useState<RelatedSymptomInsight | null>(null);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [relatedError, setRelatedError] = useState<string | null>(null);
  const [finalAdditionalInfo, setFinalAdditionalInfo] = useState<string | undefined>(undefined);
  const [editingField, setEditingField] = useState<EditableFieldKey | null>(null);
  const [editValue, setEditValue] = useState('');
  const [updatingSummary, setUpdatingSummary] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const RELATED_LOOKBACK_DAYS = 30;
  const LINK_WINDOW_DAYS = 14;
  const MAX_RELATED_SYMPTOMS = 8;
  const MAX_LINKED_SYMPTOMS = 3;

  const isSeverityClose = (currentSeverity?: string, previousSeverity?: string | null) => {
    if (!currentSeverity || !previousSeverity) return false;
    const currentNumber = parseInt(currentSeverity, 10);
    const prevNumber = parseInt(previousSeverity, 10);
    if (Number.isNaN(currentNumber) || Number.isNaN(prevNumber)) return false;
    return Math.abs(currentNumber - prevNumber) <= 2;
  };

  const hasTokenOverlap = (currentSymptom?: string, previousSymptom?: string) => {
    if (!currentSymptom || !previousSymptom) return false;
    const sanitize = (value: string) =>
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= 4);
    const currentTokens = sanitize(currentSymptom);
    const prevTokens = sanitize(previousSymptom || '');
    if (!currentTokens.length || !prevTokens.length) return false;
    return currentTokens.some((token) => prevTokens.includes(token));
  };

  const hasLocationOverlap = (currentLocation?: string, previousLocation?: string | null) => {
    if (!currentLocation || !previousLocation) return false;
    const current = currentLocation.toLowerCase();
    const previous = previousLocation.toLowerCase();
    return current.includes(previous) || previous.includes(current);
  };

  const isWithinLinkWindow = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = Math.abs(now.getTime() - created.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays <= LINK_WINDOW_DAYS;
  };

  const filterRelevantSymptoms = (stateSnapshot: ConversationState, candidates: Symptom[]) => {
    return candidates
      .filter((symptom) => {
        const nameLink = hasTokenOverlap(stateSnapshot.symptom, symptom.symptom_name);
        const locationLink = hasLocationOverlap(stateSnapshot.bodyLocation, symptom.body_location);
        const severityLink = isSeverityClose(stateSnapshot.severity, symptom.severity);
        const timeLink = isWithinLinkWindow(symptom.created_at);
        if (locationLink) return true;
        if (nameLink && timeLink) return true;
        if (timeLink && severityLink) return true;
        return false;
      })
      .slice(0, MAX_LINKED_SYMPTOMS);
  };

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

  const refreshRelatedInsights = async (stateSnapshot: ConversationState) => {
    if (!user) {
      setRelatedSymptoms([]);
      setRelatedInsight(null);
      return;
    }

    setRelatedLoading(true);
    setRelatedError(null);

    try {
      const since = new Date();
      since.setDate(since.getDate() - RELATED_LOOKBACK_DAYS);

      const { data, error } = await supabase
        .from('symptoms')
        .select('id, symptom_name, body_location, duration, description, severity, created_at, updated_at, user_id')
        .eq('user_id', user.id)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(MAX_RELATED_SYMPTOMS);

      if (error) throw error;

      const fetched = data || [];
      const relevant = filterRelevantSymptoms(stateSnapshot, fetched);
      setRelatedSymptoms(relevant);

      if (relevant.length === 0) {
        setRelatedInsight(null);
        return;
      }

      const insight = await generateRelatedSymptomInsight(stateSnapshot, relevant);
      setRelatedInsight(insight);
    } catch (error) {
      console.error('Error loading related symptoms:', error);
      setRelatedSymptoms([]);
      setRelatedInsight(null);
      setRelatedError('Unable to load recent symptoms right now.');
    } finally {
      setRelatedLoading(false);
    }
  };

  const regenerateOutputs = async (
    stateOverride?: ConversationState,
    infoOverride?: string | undefined
  ) => {
    const targetState = stateOverride || conversationState;
    const info = infoOverride !== undefined ? infoOverride : finalAdditionalInfo;
    setUpdatingSummary(true);
    try {
      const generatedSummary = await generateSummary(targetState, info);
      const rec = await generateRecommendation(targetState, {
        summary: generatedSummary,
        additionalInfo: info,
      });
      setSummary(generatedSummary);
      setRecommendation(rec);
      await refreshRelatedInsights(targetState);
    } catch (error) {
      console.error('Error regenerating outputs:', error);
      alert('There was an issue refreshing your summary. Please try again.');
    } finally {
      setUpdatingSummary(false);
    }
  };

  const finalizeSummary = async (additionalInfo: string) => {
    const trimmed = additionalInfo.trim();
    const optionalInfo = trimmed ? trimmed : undefined;
    setFinalAdditionalInfo(optionalInfo);
    await regenerateOutputs(conversationState, optionalInfo);
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
  const startEditingField = (field: EditableFieldKey) => {
    setEditingField(field);
    setEditValue((conversationState[field] as string) || '');
  };

  const cancelEditingField = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveEditedField = async () => {
    if (!editingField) return;
    const trimmed = editValue.trim();
    const updatedState: ConversationState = {
      ...conversationState,
      [editingField]: trimmed ? trimmed : undefined,
    };
    setConversationState(updatedState);
    setEditingField(null);
    setEditValue('');
    await regenerateOutputs(updatedState);
  };

  const editableFieldConfig: Array<{
    key: EditableFieldKey;
    label: string;
    placeholder: string;
    multiline?: boolean;
  }> = [
    {
      key: 'symptom',
      label: 'Symptom',
      placeholder: 'Describe your main symptom',
    },
    {
      key: 'bodyLocation',
      label: 'Location',
      placeholder: 'Where on your body do you feel this?',
    },
    {
      key: 'duration',
      label: 'Duration',
      placeholder: 'How long has this been going on?',
    },
    {
      key: 'contextualInfo',
      label: 'Additional Details',
      placeholder: 'Include triggers, patterns, or anything else helpful',
      multiline: true,
    },
    {
      key: 'severity',
      label: 'Severity (1-10)',
      placeholder: 'e.g. 6/10, throbbing in waves',
    },
  ];

  const renderEditableField = (fieldKey: EditableFieldKey) => {
    const field = editableFieldConfig.find((f) => f.key === fieldKey);
    if (!field) return null;
    if (fieldKey === 'bodyLocation' && !conversationState.requiresLocation && !conversationState.bodyLocation) {
      return null;
    }

    const currentValue = (conversationState[fieldKey] as string) || '';
    const isActive = editingField === fieldKey;
    const isMultiline = Boolean(field.multiline);

    return (
      <div key={fieldKey} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">{field.label}</p>
            {isActive ? (
              <div className="space-y-3">
                {isMultiline ? (
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    rows={4}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={field.placeholder}
                    disabled={updatingSummary}
                  />
                ) : (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={field.placeholder}
                    disabled={updatingSummary}
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={saveEditedField}
                    disabled={updatingSummary}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEditingField}
                    disabled={updatingSummary}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-gray-900 whitespace-pre-line">
                {currentValue || <span className="text-gray-500">Not provided yet.</span>}
              </p>
            )}
          </div>
          {!isActive && (
            <button
              onClick={() => startEditingField(fieldKey)}
              className="text-gray-500 hover:text-blue-600 transition-colors"
              aria-label={`Edit ${field.label}`}
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  if (showSummary) {
    return (
      <div className="flex flex-col h-full bg-white rounded-lg shadow-sm">
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <h2 className="text-2xl font-semibold text-gray-900 mb-4">Summary for Your Doctor</h2>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Review Your Answers</h3>
            </div>
            <div className="space-y-3">
              {renderEditableField('symptom')}
              {renderEditableField('bodyLocation')}
              {renderEditableField('duration')}
              {renderEditableField('contextualInfo')}
              {renderEditableField('severity')}
            </div>
          </div>

          <div className="prose prose-sm max-w-none">
            <div className="whitespace-pre-line text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-200">
              {updatingSummary ? 'Updating summary...' : summary}
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

          <div className="border border-indigo-100 rounded-lg p-4 bg-indigo-50/40">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Recent Symptoms (last {RELATED_LOOKBACK_DAYS} days)
              </h3>
              {relatedLoading && (
                <span className="text-xs text-gray-500">Checking history...</span>
              )}
            </div>
            {relatedError && (
              <p className="text-sm text-red-600 mb-3">{relatedError}</p>
            )}
            {relatedSymptoms.length === 0 && !relatedLoading && !relatedError ? (
              <p className="text-sm text-gray-600">
                No other symptoms logged in the past {RELATED_LOOKBACK_DAYS} days.
              </p>
            ) : (
              <ul className="space-y-3">
                {relatedSymptoms.map((symptom) => (
                  <li
                    key={symptom.id}
                    className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm"
                  >
                    <div className="flex justify-between text-sm text-gray-500 mb-1">
                      <span>{new Date(symptom.created_at).toLocaleDateString()}</span>
                      {symptom.severity && <span>Severity: {symptom.severity}</span>}
                    </div>
                    <p className="font-semibold text-gray-900">{symptom.symptom_name}</p>
                    {symptom.body_location && (
                      <p className="text-sm text-gray-700">Location: {symptom.body_location}</p>
                    )}
                    <p className="text-sm text-gray-700">
                      Duration: {symptom.duration || 'Not noted'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {relatedInsight && (
              <div className="mt-4 bg-white border border-indigo-100 rounded-lg p-3">
                <p className="text-sm text-gray-900 font-semibold mb-1">How they might link</p>
                <p className="text-sm text-gray-700 mb-2">{relatedInsight.summary}</p>
                <p className="text-sm text-indigo-700 font-medium">{relatedInsight.recommendation}</p>
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <p className="text-sm text-gray-600 mb-4">
              Does this summary accurately reflect your symptoms? If yes, I'll save this to your health record.
            </p>
            <div className="flex gap-3">
              <button
                onClick={confirmAndSave}
                disabled={loading || updatingSummary || editingField !== null}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Saving...' : 'Confirm & Save'}
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
