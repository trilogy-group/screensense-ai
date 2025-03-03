export interface InsightSection {
  name: string;
  details: string;
  completed?: boolean;
}

export interface InsightTemplate {
  title: string;
  sections: InsightSection[];
}

export interface InsightSession {
  id: string;
  title: string;
  path: string;
  created: Date;
  lastModified: Date;
} 