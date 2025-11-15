type ConversationState = {
  symptom?: string;
  bodyLocation?: string;
  duration?: string;
  contextualInfo?: string;
  conversationPhase: 'initial' | 'symptom' | 'location' | 'duration' | 'context' | 'summary';
  requiresLocation: boolean;
};

const symptomsThatNeedLocation = [
  'pain', 'ache', 'soreness', 'swelling', 'rash', 'bruise', 'cut', 'burn',
  'numbness', 'tingling', 'weakness', 'stiffness', 'itching', 'bump', 'lump'
];

const symptomHints: Record<string, string> = {
  cough: 'e.g. wet or dry, colour of phlegm, anything that triggers it, time of day it\'s worse',
  headache: 'e.g. throbbing or constant, location (front, back, sides), severity on a scale of 1-10, what makes it better or worse',
  fever: 'e.g. temperature if measured, time it started, accompanying symptoms like chills or sweating',
  nausea: 'e.g. accompanied by vomiting, relation to meals, severity, triggers',
  fatigue: 'e.g. how long you\'ve felt tired, impact on daily activities, sleep quality',
  dizziness: 'e.g. spinning sensation or lightheadedness, when it occurs, triggers',
  'sore throat': 'e.g. difficulty swallowing, pain level, accompanying symptoms',
  default: 'e.g. when it started, severity, what makes it better or worse, any patterns you\'ve noticed'
};

type AIProvider = 'openai' | 'gemini';

const openAiApiKey = import.meta.env.VITE_OPENAI_API_KEY;
const openAiModel = import.meta.env.VITE_OPENAI_MODEL || 'gpt-4o-mini';
const openAiBaseUrl = import.meta.env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1';

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
const geminiModel = import.meta.env.VITE_GEMINI_MODEL || 'gemini-1.5-pro';
const geminiBaseUrl = import.meta.env.VITE_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

const configuredProvider: AIProvider | undefined =
  (import.meta.env.VITE_AI_PROVIDER as AIProvider | undefined) ||
  (openAiApiKey ? 'openai' : geminiApiKey ? 'gemini' : undefined);

export function getSymptomHint(symptom: string): string {
  const lowerSymptom = symptom.toLowerCase();
  for (const [key, hint] of Object.entries(symptomHints)) {
    if (lowerSymptom.includes(key)) {
      return hint;
    }
  }
  return symptomHints.default;
}

export function needsBodyLocation(symptom: string): boolean {
  const lowerSymptom = symptom.toLowerCase();
  return symptomsThatNeedLocation.some(s => lowerSymptom.includes(s));
}

async function requestAiResponse(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!configuredProvider) {
    throw new Error('AI provider is not configured. Provide either VITE_OPENAI_API_KEY or VITE_GEMINI_API_KEY.');
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  if (configuredProvider === 'openai') {
    if (!openAiApiKey) {
      throw new Error('Missing OpenAI API key');
    }

    const response = await fetch(`${openAiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openAiApiKey}`,
      },
      body: JSON.stringify({
        model: openAiModel,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI request failed: ${errorBody}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('OpenAI response missing content');
    }
    return content;
  }

  if (!geminiApiKey) {
    throw new Error('Missing Gemini API key');
  }

  const [systemMessage] = messages;
  const chatMessages = messages.slice(1).map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));

  const response = await fetch(
    `${geminiBaseUrl}/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: chatMessages,
        system_instruction: {
          role: 'system',
          parts: [{ text: systemMessage.content }],
        },
        generationConfig: {
          temperature: 0.2,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini request failed: ${errorBody}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini response missing content');
  }

  return text;
}

function extractJson<T>(rawResponse: string): T {
  const trimmed = rawResponse.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]) as T;
    }
    throw error;
  }
}

function fallbackNextQuestion(
  state: ConversationState,
  userMessage: string
): { message: string; newState: ConversationState; phase: string } {
  const newState = { ...state };

  switch (state.conversationPhase) {
    case 'initial':
      newState.conversationPhase = 'symptom';
      return {
        message: "What symptom are you experiencing?",
        newState,
        phase: 'symptom',
      };
    case 'symptom':
      newState.symptom = userMessage;
      newState.requiresLocation = needsBodyLocation(userMessage);
      if (newState.requiresLocation) {
        newState.conversationPhase = 'location';
        return {
          message: 'Where exactly are you experiencing this?',
          newState,
          phase: 'location',
        };
      }
      newState.conversationPhase = 'duration';
      return {
        message: 'How long have you been experiencing this symptom?',
        newState,
        phase: 'duration',
      };
    case 'location':
      newState.bodyLocation = userMessage;
      newState.conversationPhase = 'duration';
      return {
        message: 'How long have you been experiencing this symptom?',
        newState,
        phase: 'duration',
      };
    case 'duration': {
      newState.duration = userMessage;
      newState.conversationPhase = 'context';
      const hint = getSymptomHint(state.symptom || '');
      return {
        message: `Please tell me more about this symptom. ${hint}\n\nAlso, is there any other information that might be relevant? For example, recent lifestyle changes, sleep patterns, stress levels, or activities that might be connected?`,
        newState,
        phase: 'context',
      };
    }
    case 'context':
      newState.contextualInfo = userMessage;
      newState.conversationPhase = 'summary';
      return {
        message:
          "Thank you for sharing that information. Is there anything else you'd like to add before I create a summary?",
        newState,
        phase: 'summary',
      };
    default:
      return {
        message: "I'm processing your information...",
        newState,
        phase: 'summary',
      };
  }
}

function fallbackSummary(state: ConversationState, additionalInfo?: string): string {
  let summary = `**Symptom Summary**\n\n`;
  summary += `**Chief Complaint:** ${state.symptom}\n\n`;

  if (state.bodyLocation) {
    summary += `**Location:** ${state.bodyLocation}\n\n`;
  }

  summary += `**Duration:** ${state.duration}\n\n`;
  summary += `**Additional Details:** ${state.contextualInfo}`;

  if (additionalInfo) {
    summary += `\n\n**Further Information:** ${additionalInfo}`;
  }

  return summary;
}

function fallbackRecommendation(state: ConversationState, additionalInfo?: string) {
  const symptom = (state.symptom || '').toLowerCase();
  const duration = (state.duration || '').toLowerCase();
  const context = `${state.contextualInfo || ''} ${additionalInfo || ''}`.toLowerCase();

  if (
    symptom.includes('chest pain') ||
    symptom.includes('difficulty breathing') ||
    symptom.includes('severe bleeding') ||
    symptom.includes('loss of consciousness') ||
    symptom.includes('seizure') ||
    (symptom.includes('headache') && (context.includes('sudden') || context.includes('worst ever')))
  ) {
    return {
      recommendation: 'Call 999 immediately',
      urgencyLevel: 'urgent' as const,
      advice: 'This requires immediate emergency attention. Please call 999 or go to A&E right away.',
    };
  }

  if (
    symptom.includes('high fever') ||
    symptom.includes('persistent vomiting') ||
    symptom.includes('severe pain') ||
    (symptom.includes('pain') && context.includes('severe')) ||
    duration.includes('week') ||
    duration.includes('month')
  ) {
    return {
      recommendation: 'Contact your GP or call 111',
      urgencyLevel: 'high' as const,
      advice:
        'You should book a GP appointment within the next 24-48 hours, or call 111 for further guidance if symptoms worsen.',
    };
  }

  if (
    symptom.includes('persistent') ||
    (symptom.includes('cough') && duration.includes('week')) ||
    symptom.includes('recurring')
  ) {
    return {
      recommendation: 'Book a GP appointment',
      urgencyLevel: 'medium' as const,
      advice: 'Consider booking a GP appointment within the next week to discuss these symptoms further.',
    };
  }

  let selfCareAdvice = '';
  if (symptom.includes('headache')) {
    selfCareAdvice =
      'Stay hydrated, rest in a quiet, dark room, and consider over-the-counter pain relief such as paracetamol or ibuprofen.';
  } else if (symptom.includes('cough')) {
    selfCareAdvice =
      'Stay hydrated, rest, use honey and lemon for soothing, and consider over-the-counter cough remedies if needed.';
  } else if (symptom.includes('sore throat')) {
    selfCareAdvice =
      'Gargle with warm salt water, stay hydrated, and consider throat lozenges or over-the-counter pain relief.';
  } else if (symptom.includes('pain') && (symptom.includes('leg') || symptom.includes('muscle'))) {
    selfCareAdvice =
      'Rest the affected area, apply ice if swollen, and consider over-the-counter anti-inflammatory medication such as ibuprofen.';
  } else if (symptom.includes('fatigue')) {
    selfCareAdvice =
      'Ensure adequate sleep, maintain a balanced diet, stay hydrated, and consider gentle exercise.';
  } else {
    selfCareAdvice =
      'Monitor your symptoms, stay hydrated, and rest. If symptoms persist or worsen, consider contacting your GP.';
  }

  return {
    recommendation: 'Self-care and monitoring',
    urgencyLevel: 'low' as const,
    advice: `${selfCareAdvice} Continue to monitor your symptoms and log any changes in this app.`,
  };
}

type NextQuestionAIResponse = {
  message: string;
  newState: ConversationState;
  phase?: ConversationState['conversationPhase'];
};

export async function generateNextQuestion(
  state: ConversationState,
  userMessage: string
): Promise<{ message: string; newState: ConversationState; phase: string }> {
  const systemPrompt = `
You are a medical intake assistant helping patients capture their symptoms clearly before speaking with a clinician.
Respond with JSON only. Never include commentary outside the JSON.
The JSON schema is: {
  "message": "assistant response shown to patient",
  "newState": {
    "symptom": "string or null",
    "bodyLocation": "string or null",
    "duration": "string or null",
    "contextualInfo": "string or null",
    "conversationPhase": "symptom|location|duration|context|summary",
    "requiresLocation": true|false
  }
}`.trim();

  const userPrompt = `
Conversation state:
${JSON.stringify(state, null, 2)}

Latest user message:
${userMessage}

Determine what information is still missing, ask a compassionate follow-up question, and advance the phase logically. Only ask for one piece of information at a time. If all information is collected, move to the summary phase and thank the user.`.trim();

  try {
    const aiResponse = await requestAiResponse(systemPrompt, userPrompt);
    const parsed = extractJson<NextQuestionAIResponse>(aiResponse);
    if (!parsed.message || !parsed.newState?.conversationPhase) {
      throw new Error('AI response missing required fields');
    }

    const newState: ConversationState = {
      ...state,
      ...parsed.newState,
      conversationPhase: parsed.newState.conversationPhase,
      requiresLocation:
        typeof parsed.newState.requiresLocation === 'boolean'
          ? parsed.newState.requiresLocation
          : state.requiresLocation,
    };

    return {
      message: parsed.message,
      newState,
      phase: parsed.phase || newState.conversationPhase,
    };
  } catch (error) {
    console.warn('Falling back to deterministic next question generation:', error);
    return fallbackNextQuestion(state, userMessage);
  }
}

type SummaryAIResponse = {
  summary: string;
};

export async function generateSummary(state: ConversationState, additionalInfo?: string): Promise<string> {
  const systemPrompt = `
You are summarizing a patient's symptoms for their clinician.
Return JSON only with the schema: { "summary": "markdown summary that includes chief complaint, location, duration, contextual factors, and any new details" }`.trim();

  const userPrompt = `
Patient provided the following details:
${JSON.stringify(state, null, 2)}

Additional information to include: ${additionalInfo || 'None'}

Write a concise markdown summary suitable for sharing with a healthcare professional.`.trim();

  try {
    const aiResponse = await requestAiResponse(systemPrompt, userPrompt);
    const parsed = extractJson<SummaryAIResponse>(aiResponse);
    if (!parsed.summary) {
      throw new Error('AI summary missing text');
    }
    return parsed.summary;
  } catch (error) {
    console.warn('Falling back to deterministic summary generation:', error);
    return fallbackSummary(state, additionalInfo);
  }
}

type RecommendationAIResponse = {
  recommendation: string;
  urgencyLevel: 'low' | 'medium' | 'high' | 'urgent';
  advice: string;
};

export async function generateRecommendation(
  state: ConversationState,
  context?: { summary?: string; additionalInfo?: string }
): Promise<RecommendationAIResponse> {
  const systemPrompt = `
You are a cautious triage assistant. Based on the patient's details, suggest the most appropriate next step.
Return JSON only using schema:
{
  "recommendation": "short action e.g. Call 999 immediately",
  "urgencyLevel": "low|medium|high|urgent",
  "advice": "one or two concise sentences expanding on the recommendation"
}`.trim();

  const userPrompt = `
Patient state:
${JSON.stringify(state, null, 2)}

Structured summary (if provided):
${context?.summary || 'Not available'}

Additional patient notes: ${context?.additionalInfo || 'None'}

Classify urgency carefully using UK guidance (999 for emergencies, GP for non-urgent, 111 for pressing). Make sure the advice feels empathetic and actionable.`.trim();

  try {
    const aiResponse = await requestAiResponse(systemPrompt, userPrompt);
    const parsed = extractJson<RecommendationAIResponse>(aiResponse);
    if (!parsed.recommendation || !parsed.urgencyLevel) {
      throw new Error('AI recommendation missing fields');
    }
    return parsed;
  } catch (error) {
    console.warn('Falling back to deterministic recommendation generation:', error);
    return fallbackRecommendation(state, context?.additionalInfo);
  }
}
