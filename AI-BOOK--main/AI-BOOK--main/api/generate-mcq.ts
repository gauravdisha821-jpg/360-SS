import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { subject, chapter } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OpenAI API key not configured. Please add OPENAI_API_KEY to your Vercel Environment Variables." });
  }

  try {
    const prompt = `Generate 5 multiple-choice questions (MCQs) for NCERT Class 10 Social Science.
    Subject: ${subject}
    Chapter: ${chapter}
    
    You MUST return a JSON object with a single key "mcqs" which is an array of 5 objects.
    Each object must have exactly these keys:
    - "question": the question text
    - "options": an array of exactly 4 strings
    - "correctIndex": an integer from 0 to 3 representing the correct option.
    
    Example format:
    {
      "mcqs": [
        {
          "question": "Example?",
          "options": ["A", "B", "C", "D"],
          "correctIndex": 0
        }
      ]
    }`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo-0125",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content;
    if (content) {
      const parsed = JSON.parse(content);
      if (parsed.mcqs && Array.isArray(parsed.mcqs)) {
        res.json(parsed);
      } else {
        throw new Error("Invalid MCQ format received from AI");
      }
    } else {
      res.status(500).json({ error: "Failed to generate MCQs: Empty response" });
    }
  } catch (error: any) {
    console.error("OpenAI MCQ Error:", error);
    res.status(500).json({ error: error.message });
  }
}
