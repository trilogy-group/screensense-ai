export interface PatentQuestion {
  questionId: string;
  question: string;
  answer?: string;
}

export interface PatentSection {
  [key: string]: PatentQuestion[];
}

export interface PatentTemplate {
  title: string;
  [key: string]: PatentQuestion[] | string; // Allow for title and other potential sections
}
