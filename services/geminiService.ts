

import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.API_KEY;

const getAI = () => {
  if (!apiKey) {
    throw new Error("API Key not configured");
  }
  return new GoogleGenAI({ apiKey });
}

export const summarizeText = async (text: string): Promise<string> => {
  const ai = getAI();
  
  // Truncate text if it's too long to avoid token limits for a quick summary
  // Approx 4 chars per token, safe limit ~30k chars for Flash 2.5 context window is huge but let's be safe for latency.
  const sample = text.length > 50000 ? text.slice(0, 50000) + "...[truncated]" : text;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Please provide a concise and engaging summary of the following text. 
      Capture the main themes and key takeaways in 3-5 sentences.
      
      Text:
      ${sample}`,
    });
    
    return response.text || "Could not generate summary.";
  } catch (error) {
    console.error("Gemini Summary Error:", error);
    throw error;
  }
};

export interface DictionaryResult {
    definition: string;
    translation?: string;
    partOfSpeech: string;
    example: string;
    phonetic: string;
}

export const getDefinition = async (word: string, context: string, language: 'en' | 'pt' = 'en'): Promise<DictionaryResult> => {
  const ai = getAI();
  const langPrompt = language === 'pt' ? 'in Portuguese' : 'in English';

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Define the word "${word}" based on this context: "${context}". 
      1. Provide a clear definition ${langPrompt}.
      2. Provide a descriptive translation of the word itself ${langPrompt} (e.g. if input is 'Pelt', output 'Pele de animal', not just 'Pele'. If input is 'Waited', output 'Esperou'). Avoid over-simplification if the specific meaning relies on context.
      `,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            definition: { type: Type.STRING },
            translation: { type: Type.STRING, description: "The direct but descriptive translation of the word" },
            partOfSpeech: { type: Type.STRING },
            example: { type: Type.STRING },
            phonetic: { type: Type.STRING },
          }
        }
      }
    });
    
    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini Dictionary Error:", error);
    throw error;
  }
};