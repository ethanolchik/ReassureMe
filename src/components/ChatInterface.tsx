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
type SeverityLevel = 'low' | 'medium' | 'high';

const descriptorSeverityMap: Record<string, SeverityLevel> = {
  mild: 'low',
  light: 'low',
  moderate: 'medium',
  'moderate-to-severe': 'high',
  severe: 'high',
  intense: 'high',
};

const criticalSymptomKeywords = ['chest', 'breath', 'breathing', 'vision', 'speech', 'numb arm'];
const lowPrioritySymptomKeywords = ['headache', 'migraine', 'tension headache'];

function parseSeverityScore(severityText?: string): number | null {
  if (!severityText) return null;
  const match = severityText.match(/(\d+(\.\d+)?)/);
  if (!match) return null;
  let value = parseFloat(match[1]);
  if (Number.isNaN(value)) return null;
  if (value > 10) value = 10;
  if (value < 0) value = 0;
  return value;
}

function deriveSeverityLevel(symptom?: string, severityText?: string): SeverityLevel {
  const lowerSeverity = severityText?.toLowerCase() || '';
  const descriptorEntry = Object.entries(descriptorSeverityMap).find(([descriptor]) =>
    lowerSeverity.includes(descriptor)
  );

  let level: SeverityLevel = 'medium';

  if (descriptorEntry) {
    level = descriptorEntry[1];
  } else {
    const score = parseSeverityScore(severityText);
    if (score !== null) {
      if (score <= 3) level = 'low';
      else if (score <= 6) level = 'medium';
      else level = 'high';
    } else if (lowerSeverity.includes('worse') || lowerSeverity.includes('can\'t cope')) {
      level = 'high';
    } else if (lowerSeverity.includes('manageable') || lowerSeverity.includes('mild')) {
      level = 'low';
    }
  }

  if (symptom) {
    const lowerSymptom = symptom.toLowerCase();
    if (criticalSymptomKeywords.some((keyword) => lowerSymptom.includes(keyword))) {
      level = level === 'low' ? 'medium' : 'high';
    } else if (
      lowPrioritySymptomKeywords.some((keyword) => lowerSymptom.includes(keyword)) &&
      level === 'medium'
    ) {
      level = 'low';
    }
  }

  return level;
}

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
  const [improvementTips, setImprovementTips] = useState<string[]>([]);
  const [editingField, setEditingField] = useState<EditableFieldKey | null>(null);
  const [editValue, setEditValue] = useState('');
  const [updatingSummary, setUpdatingSummary] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const RELATED_LOOKBACK_DAYS = 30;
  const MAX_RECENT_SYMPTOMS = 8;

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
        .limit(MAX_RECENT_SYMPTOMS);

      if (error) throw error;

      const fetched = data || [];
      setRelatedSymptoms(fetched);

      if (fetched.length === 0) {
        setRelatedInsight(null);
        return;
      }

      const priorSnapshots = fetched.map((symptom) => ({
        id: symptom.id,
        symptom_name: symptom.symptom_name,
        body_location: symptom.body_location,
        duration: symptom.duration,
        severity: symptom.severity,
        description: symptom.description,
        created_at: symptom.created_at,
      }));

      const insight = await generateRelatedSymptomInsight(stateSnapshot, priorSnapshots);
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
      const summaryPayload = await generateSummary(targetState, info);
      const rec = await generateRecommendation(targetState, {
        summary: summaryPayload.html,
        additionalInfo: info,
      });
      setSummary(summaryPayload.html);
      setImprovementTips(summaryPayload.tips);
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
    const derivedSeverity = deriveSeverityLevel(conversationState.symptom, conversationState.severity);

    try {
      const { data: symptomData, error: symptomError } = await supabase
        .from('symptoms')
        .insert({
          user_id: user.id,
          symptom_name: conversationState.symptom || '',
          body_location: conversationState.bodyLocation || null,
          duration: conversationState.duration || '',
          description: conversationState.contextualInfo || '',
          severity: derivedSeverity,
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

  const renderRelatedSymptoms = () => {
    if (relatedLoading) {
      return (
        <p className="text-sm text-gray-600">
          Checking for possible links with your recent symptoms...
        </p>
      );
    }

    if (relatedError) {
      return <p className="text-sm text-red-600">{relatedError}</p>;
    }

    if (relatedSymptoms.length === 0) {
      return (
        <p className="text-sm text-gray-600">
          No other symptoms logged in the past {RELATED_LOOKBACK_DAYS} days.
        </p>
      );
    }

    const linkedIdSet = new Set(relatedInsight?.linkedSymptomIds ?? []);
    const linkedList = relatedSymptoms.filter((symptom) => linkedIdSet.has(symptom.id));
    const otherList = relatedSymptoms.filter((symptom) => !linkedIdSet.has(symptom.id));

    const renderList = (list: Symptom[]) => (
      <ul className="space-y-3">
        {list.map((symptom) => (
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
    );

    return (
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 mb-2">
            Potentially linked symptoms
          </h4>
          {linkedList.length > 0 ? (
            renderList(linkedList)
          ) : (
            <p className="text-sm text-gray-600">
              None of your recent symptoms appear related to the current issue.
            </p>
          )}
        </div>
        {otherList.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-2">
              Other recent symptoms
            </h4>
            {renderList(otherList)}
          </div>
        )}
        {relatedInsight && (
          <div className="bg-white border border-indigo-100 rounded-lg p-3">
            <p className="text-sm text-gray-900 font-semibold mb-1">Clinician guidance</p>
            <p className="text-sm text-gray-700 mb-2">{relatedInsight.summary}</p>
            <p className="text-sm text-indigo-700 font-medium">{relatedInsight.recommendation}</p>
          </div>
        )}
      </div>
    );
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

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Symptom Summary</h3>
            <div
              className="text-gray-700 text-sm leading-relaxed space-y-2"
              dangerouslySetInnerHTML={{
                __html: updatingSummary
                  ? '<p>Updating summary...</p>'
                  : summary || '<p>No summary available.</p>',
              }}
            />
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

          {improvementTips.length > 0 && (
            <div className="border border-green-100 rounded-lg p-4 bg-green-50/60">
              <h3 className="text-lg Font-semibold text-gray-900 mb-2">Helpful Tips</h3>
              <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                {improvementTips.map((tip, index) => (
                  <li key={`${tip}-${index}`}>{tip}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="border border-indigo-100 rounded-lg p-4 bg-indigo-50/40">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">
                Recent Symptoms (last {RELATED_LOOKBACK_DAYS} days)
              </h3>
            </div>
            {renderRelatedSymptoms()}
          </div>

          <div className="border-t pt-4">
            <p className="text-sm text-gray-600 mb-4">
              Does this summary accurately reflect your symptoms? Feel free to edit any information provided before it is added to your record.
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
