import { MessageSquarePlus, History, LogOut, Activity } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type HomeScreenProps = {
  onStartChat: () => void;
  onViewHistory: () => void;
};

export default function HomeScreen({ onStartChat, onViewHistory }: HomeScreenProps) {
  const { signOut, user } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">ReassureMe</h1>
              <p className="text-sm text-gray-600">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-8 lg:col-span-2">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Welcome to Your Health Companion
            </h2>
            <p className="text-gray-600 leading-relaxed mb-6">
              Log symptoms, capture context, and get guidance on when to seek medical attention. We help you organise your
              thoughts before speaking with a clinician so you can feel confident and prepared.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>Important:</strong> ReassureMe does not provide diagnoses. It helps you record what you're
                experiencing and offers general support. Always consult a healthcare professional for medical advice.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">How It Works</h3>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  1
                </div>
                <p className="text-gray-700 text-sm leading-relaxed">
                  <strong>Describe your symptoms</strong> in a conversational flow. The assistant guides you step-by-step so nothing important is missed.
                </p>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-7 h-7 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  2
                </div>
                <p className="text-gray-700 text-sm leading-relaxed">
                  <strong>Get personalised guidance</strong> on whether self-care, GP contact, or urgent care is appropriate based on what you share.
                </p>
              </div>
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-7 h-7 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                  3
                </div>
                <p className="text-gray-700 text-sm leading-relaxed">
                  <strong>Share summaries</strong> with clinicians so appointments start with clear, structured information.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 items-stretch">
          <button
            onClick={onStartChat}
            className="group bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-all duration-200 text-left flex flex-col"
          >
            <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <MessageSquarePlus className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">Log a Symptom</h3>
            <p className="text-gray-600 leading-relaxed">
              Start a conversation to log new symptoms. I'll ask you relevant questions and provide
              personalized guidance based on what you tell me.
            </p>
          </button>

          <button
            onClick={onViewHistory}
            className="group bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-all duration-200 text-left flex flex-col"
          >
            <div className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <History className="w-7 h-7 text-white" />
            </div>
            <h3 className="text-2xl font-semibold text-gray-900 mb-2">View History</h3>
            <p className="text-gray-600 leading-relaxed">
              Review your previously logged symptoms, see summaries for your doctor, and track
              patterns over time.
            </p>
          </button>
        </div>

      </div>
    </div>
  );
}
