import { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthForm from './components/AuthForm';
import HomeScreen from './components/HomeScreen';
import ChatInterface from './components/ChatInterface';
import HistoryView from './components/HistoryView';

type View = 'home' | 'chat' | 'history';

function AppContent() {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<View>('home');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  if (currentView === 'chat') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-4xl mx-auto h-[calc(100vh-2rem)]">
          <ChatInterface onComplete={() => setCurrentView('home')} />
        </div>
      </div>
    );
  }

  if (currentView === 'history') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-4xl mx-auto h-[calc(100vh-2rem)]">
          <HistoryView onBack={() => setCurrentView('home')} />
        </div>
      </div>
    );
  }

  return (
    <HomeScreen
      onStartChat={() => setCurrentView('chat')}
      onViewHistory={() => setCurrentView('history')}
    />
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
