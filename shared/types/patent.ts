export interface PatentQuestion {
  questionId: string;
  question: string;
  answer?: string;
}

export interface PatentSection {
  name: string;
  details: string;
  completed?: boolean;
}

export interface PatentTemplate {
  title: string;
  sections: PatentSection[];
}
