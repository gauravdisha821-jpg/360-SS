import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages, subject, chapter } = req.body;
  
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OpenAI API key not configured. Please add OPENAI_API_KEY to your Vercel Environment Variables." });
  }

  try {
    const systemPrompt = `You are a specialized NCERT Class 10 Social Science assistant. 
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
}
