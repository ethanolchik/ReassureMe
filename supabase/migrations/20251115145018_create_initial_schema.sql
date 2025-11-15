/*
  # Initial Schema for NHS Symptom Tracker

  1. New Tables
    - `symptoms`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `symptom_name` (text) - The main symptom being logged
      - `body_location` (text, nullable) - Where the symptom is located
      - `duration` (text) - How long it's been happening
      - `description` (text) - Rich contextual information about the symptom
      - `severity` (text, nullable) - Severity level if applicable
      - `created_at` (timestamptz) - When the symptom was logged
      - `updated_at` (timestamptz) - Last update time
    
    - `conversations`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `symptom_id` (uuid, references symptoms, nullable initially)
      - `messages` (jsonb) - Array of message objects with role and content
      - `summary` (text, nullable) - AI-generated summary for doctor
      - `recommendation` (text, nullable) - AI recommendation (see GP, self-care, etc)
      - `urgency_level` (text) - low, medium, high, urgent
      - `completed_at` (timestamptz, nullable) - When conversation was finished
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `contextual_factors`
      - `id` (uuid, primary key)
      - `symptom_id` (uuid, references symptoms)
      - `factor_type` (text) - Type of contextual info (sleep, activity, stress, etc)
      - `description` (text) - Details about the factor
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

CREATE TABLE IF NOT EXISTS symptoms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  symptom_name text NOT NULL,
  body_location text,
  duration text NOT NULL,
  description text NOT NULL,
  severity text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  symptom_id uuid REFERENCES symptoms(id),
  messages jsonb DEFAULT '[]'::jsonb,
  summary text,
  recommendation text,
  urgency_level text DEFAULT 'low',
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contextual_factors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symptom_id uuid REFERENCES symptoms(id) NOT NULL,
  factor_type text NOT NULL,
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE symptoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE contextual_factors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own symptoms"
  ON symptoms FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own symptoms"
  ON symptoms FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own symptoms"
  ON symptoms FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own symptoms"
  ON symptoms FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view factors for own symptoms"
  ON contextual_factors FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM symptoms
    WHERE symptoms.id = contextual_factors.symptom_id
    AND symptoms.user_id = auth.uid()
  ));

CREATE POLICY "Users can insert factors for own symptoms"
  ON contextual_factors FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM symptoms
    WHERE symptoms.id = contextual_factors.symptom_id
    AND symptoms.user_id = auth.uid()
  ));

CREATE POLICY "Users can update factors for own symptoms"
  ON contextual_factors FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM symptoms
    WHERE symptoms.id = contextual_factors.symptom_id
    AND symptoms.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM symptoms
    WHERE symptoms.id = contextual_factors.symptom_id
    AND symptoms.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete factors for own symptoms"
  ON contextual_factors FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM symptoms
    WHERE symptoms.id = contextual_factors.symptom_id
    AND symptoms.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_symptoms_user_id ON symptoms(user_id);
CREATE INDEX IF NOT EXISTS idx_symptoms_created_at ON symptoms(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_symptom_id ON conversations(symptom_id);
CREATE INDEX IF NOT EXISTS idx_contextual_factors_symptom_id ON contextual_factors(symptom_id);