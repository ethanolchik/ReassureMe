import { useState, useEffect } from 'react';
import { Calendar, MapPin, Clock, ChevronRight, ArrowLeft, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Symptom, Conversation } from '../lib/supabase';

type SymptomWithConversation = Symptom & {
  conversation?: Conversation;
};

export default function HistoryView({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const [symptoms, setSymptoms] = useState<SymptomWithConversation[]>([]);
  const [selectedSymptom, setSelectedSymptom] = useState<SymptomWithConversation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSymptoms();
  }, [user]);

  const loadSymptoms = async () => {
    if (!user) return;

    try {
      const { data: symptomsData, error: symptomsError } = await supabase
        .from('symptoms')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (symptomsError) throw symptomsError;

      if (symptomsData) {
        const symptomsWithConversations = await Promise.all(
          symptomsData.map(async (symptom) => {
            const { data: conversationData } = await supabase
              .from('conversations')
              .select('*')
              .eq('symptom_id', symptom.id)
              .maybeSingle();

            return {
              ...symptom,
              conversation: conversationData || undefined,
            };
          })
        );

        setSymptoms(symptomsWithConversations);
      }
    } catch (error) {
      console.error('Error loading symptoms:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;

    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getUrgencyBadge = (level: string) => {
    const colors = {
      urgent: 'bg-red-100 text-red-800',
      high: 'bg-orange-100 text-orange-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800',
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[level as keyof typeof colors] || colors.low}`}>
        {level.charAt(0).toUpperCase() + level.slice(1)}
      </span>
    );
  };

  if (selectedSymptom) {
    return (
      <div className="flex flex-col h-full bg-white rounded-lg shadow-sm">
        <div className="border-b p-4">
          <button
            onClick={() => setSelectedSymptom(null)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to history</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-6">
            <div className="flex items-start justify-between mb-2">
              <h2 className="text-2xl font-semibold text-gray-900">
                {selectedSymptom.symptom_name}
              </h2>
              {selectedSymptom.conversation && (
                <div>{getUrgencyBadge(selectedSymptom.conversation.urgency_level)}</div>
              )}
            </div>

            <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(selectedSymptom.created_at)}</span>
              </div>
              {selectedSymptom.body_location && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  <span>{selectedSymptom.body_location}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                <span>{selectedSymptom.duration}</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Description</h3>
              <p className="text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg">
                {selectedSymptom.description}
              </p>
            </div>

            {selectedSymptom.conversation?.summary && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Doctor's Summary</h3>
                <div
                  className="text-gray-700 bg-blue-50 p-4 rounded-lg border border-blue-100 prose prose-sm"
                  dangerouslySetInnerHTML={{
                    __html: selectedSymptom.conversation.summary,
                  }}
                />
              </div>
            )}

            {selectedSymptom.conversation?.recommendation && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Recommendation</h3>
                <div className="flex items-start gap-3 p-4 rounded-lg bg-gray-50 border border-gray-200">
                  <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                  <p className="text-gray-700 leading-relaxed">
                    {selectedSymptom.conversation.recommendation}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Loading your history...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm">
      <div className="border-b p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Symptom History</h2>
          <button
            onClick={onBack}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {symptoms.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Calendar className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No symptoms logged yet</h3>
            <p className="text-gray-600 max-w-sm">
              When you log your first symptom, it will appear here for you to review.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {symptoms.map((symptom) => (
              <button
                key={symptom.id}
                onClick={() => setSelectedSymptom(symptom)}
                className="w-full text-left p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {symptom.symptom_name}
                      </h3>
                      {symptom.conversation && (
                        <div>{getUrgencyBadge(symptom.conversation.urgency_level)}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-2">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(symptom.created_at)}</span>
                      </div>
                      {symptom.body_location && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{symptom.body_location}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 line-clamp-2">{symptom.description}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 ml-2 flex-shrink-0" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
