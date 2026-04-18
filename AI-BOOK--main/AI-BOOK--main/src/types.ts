export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  tokensUsed: number;
  dailyLimit: number;
  lastResetDate: string;
  role?: "admin" | "student";
}

export interface MCQQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface MCQResult {
  userId: string;
  subject: string;
  chapter: string;
  score: number;
  total: number;
  timestamp: string;
}

export const SUBJECTS = {
  History: [
    "The Rise of Nationalism in Europe",
    "Nationalism in India",
    "The Making of a Global World",
    "The Age of Industrialisation",
    "Print Culture and the Modern World"
  ],
  Geography: [
    "Resources and Development",
    "Forest and Wildlife Resources",
    "Water Resources",
    "Agriculture",
    "Minerals and Energy Resources",
    "Manufacturing Industries",
    "Lifelines of National Economy"
  ],
  "Political Science": [
    "Power Sharing",
    "Federalism",
    "Gender, Religion and Caste",
    "Political Parties",
    "Outcomes of Democracy"
  ],
  Economics: [
    "Development",
    "Sectors of the Indian Economy",
    "Money and Credit",
    "Globalisation and the Indian Economy",
    "Consumer Rights"
  ]
};
