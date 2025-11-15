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

        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Welcome to Your Health Companion
          </h2>
          <p className="text-gray-600 leading-relaxed mb-6">
            This app helps you track your symptoms and provides guidance on when to seek medical attention.
            Log any symptoms you're experiencing, and we'll help you understand whether you should see a GP.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>Important:</strong> This app does not provide medical diagnoses. It's designed to help
              you keep track of your symptoms and provide general guidance. Always consult with a healthcare
              professional for medical advice.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <button
            onClick={onStartChat}
            className="group bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-all duration-200 text-left"
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
            className="group bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-all duration-200 text-left"
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

        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">How It Works</h3>
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                1
              </div>
              <p className="text-gray-700">
                <strong>Describe your symptoms:</strong> Have a natural conversation about what you're experiencing
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                2
              </div>
              <p className="text-gray-700">
                <strong>Get guidance:</strong> Receive advice on whether to see a GP or manage symptoms at home
              </p>
            </div>
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                3
              </div>
              <p className="text-gray-700">
                <strong>Share with your doctor:</strong> Use the generated summaries during GP appointments
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
