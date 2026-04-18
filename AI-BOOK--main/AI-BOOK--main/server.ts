import express from "express";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const app = express();
const PORT = 3000;

app.use(express.json());

// API routes
app.post("/api/chat", async (req, res) => {
  const { messages, subject, chapter } = req.body;
  
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OpenAI API key not configured." });
  }

  try {
    const systemPrompt = `You are DISHA AI, a specialized NCERT Class 10 Social Science assistant. 
    You only answer questions related to NCERT Class 10 Social Science. 
    The current subject is ${subject} and chapter is ${chapter}. 
    If the user asks anything outside of NCERT Class 10 Social Science, politely decline and state that you are only trained for this specific curriculum.
    Keep responses concise and educational.`;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
    });

    res.json({ content: response.choices[0].message.content });
  } catch (error: any) {
    console.error("OpenAI Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/generate-mcq", async (req, res) => {
  const { subject, chapter } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OpenAI API key not configured." });
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
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  if (process.env.NODE_ENV !== "production" || !process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer().catch(console.error);

export default app;
