import { GoogleGenerativeAI } from '@google/generative-ai';

export type ConversationState = {
  symptom?: string;
  bodyLocation?: string;
  duration?: string;
  contextualInfo?: string;
  severity?: string;
  conversationPhase: 'initial' | 'symptom' | 'location' | 'duration' | 'context' | 'severity' | 'summary';
  requiresLocation: boolean;
};

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
const geminiModel = import.meta.env.VITE_GEMINI_MODEL || 'gemini-1.5-pro';
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

type PhaseConfig = {
  intent: string;
  canonicalQuestion: string;
};

const PHASE_CONFIG: Record<'location' | 'duration' | 'context' | 'severity' | 'summary', PhaseConfig> =
  {
    location: {
      intent:
        'encourage the patient to pinpoint the exact area, side, or depth of the symptom so a clinician can visualise it',
      canonicalQuestion: 'Where exactly are you experiencing this symptom?',
    },
    duration: {
      intent:
        'clarify how long the symptom has been present, including onset, frequency, or whether it comes and goes',
      canonicalQuestion: 'How long have you been experiencing this symptom?',
    },
    context: {
      intent:
        'invite the patient to describe texture, triggers, relieving factors, lifestyle changes, or other qualitative details relevant to clinicians',
      canonicalQuestion: 'Please tell me more about this symptom.',
    },
    severity: {
      intent:
        'capture the patient’s perception of severity using a 1-10 scale plus descriptors that help interpret the number',
      canonicalQuestion: 'On a scale of 1 to 10, how severe is this symptom right now?',
    },
    summary: {
      intent: 'check for final additions before preparing a clinical summary; express gratitude for their input',
      canonicalQuestion: "Is there anything else you'd like me to include before I create your summary?",
    },
  };

async function requestAiResponse(systemPrompt: string, userPrompt: string): Promise<string> {
  if (!genAI) {
    throw new Error('Missing Gemini API key');
  }

  const model = genAI.getGenerativeModel({
    model: geminiModel,
    systemInstruction: systemPrompt,
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });

  const text = result.response.text();
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

async function determineLocationRequirement(symptom: string): Promise<boolean> {
  if (!symptom) return false;

  const systemPrompt = `
You decide whether a clinician would need precise body location details for the given symptom.
Return JSON only like { "requiresLocation": boolean }.`.trim();

  const userPrompt = `
Symptom description: ${symptom}

Guidance:
- true if the symptom is localised (pain, numbness, rash, swelling, stiffness, etc.).
- false if it's systemic (fatigue, nausea, fever, dizziness, etc.) or already specifies location.`.trim();

  try {
    const aiResponse = await requestAiResponse(systemPrompt, userPrompt);
    const parsed = extractJson<{ requiresLocation: boolean }>(aiResponse);
    return Boolean(parsed.requiresLocation);
  } catch (error) {
    console.warn('Unable to determine if location is required. Defaulting to false.', error);
    return false;
  }
}

async function generatePhaseQuestion(
  phase: Exclude<ConversationState['conversationPhase'], 'initial' | 'symptom'>,
  state: ConversationState
): Promise<string> {
  const config = PHASE_CONFIG[phase];
  if (!config) return 'Thank you for sharing that information.';

  const systemPrompt = `
You are a compassionate NHS triage assistant collecting information via a structured flow.
Respond with JSON only: { "message": "assistant response" }.
Your job is to ask the canonical question for the upcoming phase, while tailoring the hints/examples to the patient's current details.`.trim();

  const userPrompt = `
Phase to ask about: ${phase}
Canonical question: ${config.canonicalQuestion}
Intent: ${config.intent}

Patient information so far:
${JSON.stringify(state, null, 2)}

Instructions:
- Keep it under two short paragraphs.
- Include at least one personalised hint (e.g. refer to cough qualities when the symptom is a cough).
- Maintain gentle, reassuring NHS tone.
- Do not ask for information outside of the ${phase} focus.`.trim();

  const fallbackMessages: Record<typeof phase, string> = {
    location: 'Where exactly are you experiencing this symptom?',
    duration: 'How long have you been experiencing this symptom?',
    context: 'Please tell me more about this symptom. Are there any triggers or patterns?',
    severity: 'On a scale of 1 to 10, how severe is this symptom right now?',
    summary:
      "Thank you for sharing everything. Is there anything else you'd like me to include before I create your summary?",
  };

  try {
    const aiResponse = await requestAiResponse(systemPrompt, userPrompt);
    const parsed = extractJson<{ message: string }>(aiResponse);
    return parsed.message || fallbackMessages[phase];
  } catch (error) {
    console.warn(`Falling back to default ${phase} prompt`, error);
    return fallbackMessages[phase];
  }
}

export async function generateNextQuestion(
  state: ConversationState,
  userMessage: string
): Promise<{ message: string; newState: ConversationState; phase: string }> {
  const newState: ConversationState = { ...state };
  let nextPhase: ConversationState['conversationPhase'] = state.conversationPhase;

  switch (state.conversationPhase) {
    case 'initial':
      nextPhase = 'symptom';
      break;
    case 'symptom': {
      newState.symptom = userMessage;
      const requiresLocation = await determineLocationRequirement(userMessage);
      newState.requiresLocation = requiresLocation;
      nextPhase = requiresLocation ? 'location' : 'duration';
      break;
    }
    case 'location':
      newState.bodyLocation = userMessage;
      nextPhase = 'duration';
      break;
    case 'duration':
      newState.duration = userMessage;
      nextPhase = 'context';
      break;
    case 'context':
      newState.contextualInfo = userMessage;
      nextPhase = 'severity';
      break;
    case 'severity':
      newState.severity = userMessage;
      nextPhase = 'summary';
      break;
    default:
      nextPhase = 'summary';
  }

  newState.conversationPhase = nextPhase;

  if (nextPhase === 'symptom') {
    return {
      message: 'What symptom are you experiencing?',
      newState,
      phase: 'symptom',
    };
  }

  if (nextPhase === 'summary') {
    const summaryPrompt = await generatePhaseQuestion('summary', newState);
    return { message: summaryPrompt, newState, phase: 'summary' };
  }

  const message = await generatePhaseQuestion(
    nextPhase as Exclude<ConversationState['conversationPhase'], 'initial' | 'symptom' | 'summary'>,
    newState
  );

  return { message, newState, phase: nextPhase };
}

type SummaryAIResponse = {
  summary: string;
  tips?: string[];
};

export async function generateSummary(
  state: ConversationState,
  additionalInfo?: string
): Promise<{ html: string; tips: string[] }> {
  const systemPrompt = `
You are summarising a patient's symptoms for their clinician.
Return JSON only using schema:
{
  "summary": "<div> HTML summary suitable for embedding directly </div>",
  "tips": ["<optional short improvement tip>", "..."]
}
Summary requirements:
- Use semantic HTML tags (<section>, <p>, <ul>, etc.) instead of markdown.
- Include chief complaint, location (if provided), duration, severity, contextual factors, and extra patient info.
- Tips (if provided) should be focused, actionable self-care or tracking ideas (max 3 tips).`.trim();

  const userPrompt = `
Patient details:
${JSON.stringify(state, null, 2)}

Additional info to include: ${additionalInfo || 'None'}

Keep the summary concise but thorough enough for a GP to skim quickly.`.trim();

  try {
    const aiResponse = await requestAiResponse(systemPrompt, userPrompt);
    const parsed = extractJson<SummaryAIResponse>(aiResponse);
    if (!parsed.summary) throw new Error('Summary missing text');
    return { html: parsed.summary, tips: parsed.tips || [] };
  } catch (error) {
    console.warn('Falling back to templated summary', error);
    const fallbackHtml = `
<section>
  <h3>Symptom Summary</h3>
  <p><strong>Chief Complaint:</strong> ${state.symptom || 'Not provided'}</p>
  ${state.bodyLocation ? `<p><strong>Location:</strong> ${state.bodyLocation}</p>` : ''}
  <p><strong>Duration:</strong> ${state.duration || 'Not provided'}</p>
  <p><strong>Severity:</strong> ${state.severity || 'Not provided'}</p>
  <p><strong>Details shared:</strong> ${state.contextualInfo || 'No additional context provided.'}</p>
  ${additionalInfo ? `<p><strong>Further Information:</strong> ${additionalInfo}</p>` : ''}
</section>
`.trim();

    return {
      html: fallbackHtml,
      tips: [
        'Keep logging symptoms daily so your clinician can spot patterns.',
        'Stay hydrated and rest as needed while monitoring changes.',
      ],
    };
  }
}

type RecommendationAIResponse = {
  recommendation: string;
  urgencyLevel: 'low' | 'medium' | 'high' | 'urgent';
  advice: string;
};

export type RelatedSymptomInsight = {
  summary: string;
  recommendation: string;
  linkedSymptomIds: string[];
};

type PriorSymptomSnapshot = {
  id: string;
  symptom_name: string;
  body_location?: string | null;
  duration?: string;
  severity?: string | null;
  description?: string;
  created_at: string;
};

export async function generateRecommendation(
  state: ConversationState,
  context?: { summary?: string; additionalInfo?: string }
): Promise<RecommendationAIResponse> {
  const systemPrompt = `
You are an NHS-aligned triage assistant. Provide cautious, safety-first guidance.
Return JSON with schema {
  "recommendation": "short action like Call 999 immediately",
  "urgencyLevel": "low|medium|high|urgent",
  "advice": "two concise sentences expanding on the recommendation"
}.`.trim();

  const userPrompt = `
Patient state:
${JSON.stringify(state, null, 2)}

Clinical-style summary:
${context?.summary || 'Not available'}

Additional notes: ${context?.additionalInfo || 'None'}

Base your judgement on the details provided. Use UK conventions (999 emergency, 111 urgent advice, GP for routine).`.trim();

  try {
    const aiResponse = await requestAiResponse(systemPrompt, userPrompt);
    const parsed = extractJson<RecommendationAIResponse>(aiResponse);
    if (!parsed.recommendation || !parsed.urgencyLevel || !parsed.advice) {
      throw new Error('Recommendation response incomplete');
    }
    return parsed;
  } catch (error) {
    console.warn('Falling back to generic recommendation', error);
    return {
      recommendation: 'Monitor symptoms and contact a clinician if they worsen',
      urgencyLevel: 'low',
      advice:
        'Keep tracking how you feel, rest, stay hydrated, and book a GP appointment if anything changes or you become more concerned.',
    };
  }
}

export async function generateRelatedSymptomInsight(
  state: ConversationState,
  priorSymptoms: PriorSymptomSnapshot[]
): Promise<RelatedSymptomInsight | null> {
  if (!priorSymptoms.length) {
    return null;
  }

  const systemPrompt = `
You are an NHS clinician assistant. Assess whether recent symptoms likely stem from the same underlying disease as the current complaint.
Return JSON only using schema:
{
  "summary": "<short paragraph describing any suspected linkage>",
  "recommendation": "<actionable next step>",
  "linkedSymptomIds": ["<id>", "..."] // only include IDs that plausibly share the same disease process
}
Only mark symptoms as linked if the pathology could reasonably be the same. Do not link symptoms purely because they overlap in time.`.trim();

  const userPrompt = `
Current symptom state:
${JSON.stringify(state, null, 2)}

Recent symptom history (most recent first):
${JSON.stringify(priorSymptoms, null, 2)}

Highlight patterns (timing, body location, severity) and call out red flags if necessary.`.trim();

  try {
    const aiResponse = await requestAiResponse(systemPrompt, userPrompt);
    const parsed = extractJson<RelatedSymptomInsight>(aiResponse);
    if (!parsed.summary || !parsed.recommendation || !Array.isArray(parsed.linkedSymptomIds)) {
      throw new Error('Related symptom insight incomplete');
    }
    return parsed;
  } catch (error) {
    console.warn('Unable to generate related symptom insight', error);
    return {
      summary: 'Recent symptoms were reviewed but no automated linkage could be confirmed.',
      recommendation:
        'Share this list with your GP if you notice a recurring pattern or if symptoms cluster closely together.',
      linkedSymptomIds: [],
    };
  }
}
