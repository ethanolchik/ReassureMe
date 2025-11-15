import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Message = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

export type Symptom = {
  id: string;
  user_id: string;
  symptom_name: string;
  body_location: string | null;
  duration: string;
  description: string;
  severity: string | null;
  created_at: string;
  updated_at: string;
};

export type Conversation = {
  id: string;
  user_id: string;
  symptom_id: string | null;
  messages: Message[];
  summary: string | null;
  recommendation: string | null;
  urgency_level: 'low' | 'medium' | 'high' | 'urgent';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContextualFactor = {
  id: string;
  symptom_id: string;
  factor_type: string;
  description: string;
  created_at: string;
};
