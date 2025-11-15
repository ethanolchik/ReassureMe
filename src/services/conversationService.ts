import type { Message } from '../lib/supabase';

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

export function generateNextQuestion(
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
        phase: 'symptom'
      };

    case 'symptom':
      newState.symptom = userMessage;
      newState.requiresLocation = needsBodyLocation(userMessage);

      if (newState.requiresLocation) {
        newState.conversationPhase = 'location';
        return {
          message: "Where exactly are you experiencing this?",
          newState,
          phase: 'location'
        };
      } else {
        newState.conversationPhase = 'duration';
        return {
          message: "How long have you been experiencing this symptom?",
          newState,
          phase: 'duration'
        };
      }

    case 'location':
      newState.bodyLocation = userMessage;
      newState.conversationPhase = 'duration';
      return {
        message: "How long have you been experiencing this symptom?",
        newState,
        phase: 'duration'
      };

    case 'duration':
      newState.duration = userMessage;
      newState.conversationPhase = 'context';
      const hint = getSymptomHint(state.symptom || '');
      return {
        message: `Please tell me more about this symptom. ${hint}\n\nAlso, is there any other information that might be relevant? For example, recent lifestyle changes, sleep patterns, stress levels, or activities that might be connected?`,
        newState,
        phase: 'context'
      };

    case 'context':
      newState.contextualInfo = userMessage;
      newState.conversationPhase = 'summary';
      return {
        message: "Thank you for sharing that information. Is there anything else you'd like to add before I create a summary?",
        newState,
        phase: 'summary'
      };

    default:
      return {
        message: "I'm processing your information...",
        newState,
        phase: 'summary'
      };
  }
}

export function generateSummary(state: ConversationState, additionalInfo?: string): string {
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

export function generateRecommendation(state: ConversationState): {
  recommendation: string;
  urgencyLevel: 'low' | 'medium' | 'high' | 'urgent';
  advice: string;
} {
  const symptom = (state.symptom || '').toLowerCase();
  const duration = (state.duration || '').toLowerCase();
  const context = (state.contextualInfo || '').toLowerCase();

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
      urgencyLevel: 'urgent',
      advice: 'This requires immediate emergency attention. Please call 999 or go to A&E right away.'
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
      urgencyLevel: 'high',
      advice: 'You should book a GP appointment within the next 24-48 hours, or call 111 for further guidance if symptoms worsen.'
    };
  }

  if (
    symptom.includes('persistent') ||
    (symptom.includes('cough') && duration.includes('week')) ||
    symptom.includes('recurring')
  ) {
    return {
      recommendation: 'Book a GP appointment',
      urgencyLevel: 'medium',
      advice: 'Consider booking a GP appointment within the next week to discuss these symptoms further.'
    };
  }

  let selfCareAdvice = '';
  if (symptom.includes('headache')) {
    selfCareAdvice = 'Stay hydrated, rest in a quiet, dark room, and consider over-the-counter pain relief such as paracetamol or ibuprofen.';
  } else if (symptom.includes('cough')) {
    selfCareAdvice = 'Stay hydrated, rest, use honey and lemon for soothing, and consider over-the-counter cough remedies if needed.';
  } else if (symptom.includes('sore throat')) {
    selfCareAdvice = 'Gargle with warm salt water, stay hydrated, and consider throat lozenges or over-the-counter pain relief.';
  } else if (symptom.includes('pain') && (symptom.includes('leg') || symptom.includes('muscle'))) {
    selfCareAdvice = 'Rest the affected area, apply ice if swollen, and consider over-the-counter anti-inflammatory medication such as ibuprofen.';
  } else if (symptom.includes('fatigue')) {
    selfCareAdvice = 'Ensure adequate sleep, maintain a balanced diet, stay hydrated, and consider gentle exercise.';
  } else {
    selfCareAdvice = 'Monitor your symptoms, stay hydrated, and rest. If symptoms persist or worsen, consider contacting your GP.';
  }

  return {
    recommendation: 'Self-care and monitoring',
    urgencyLevel: 'low',
    advice: selfCareAdvice + ' Continue to monitor your symptoms and log any changes in this app.'
  };
}
