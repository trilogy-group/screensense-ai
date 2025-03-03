import { InsightTemplate, InsightSection } from '../types/insight';

export const insightTemplate: InsightTemplate = {
  title: 'New Insight',
  sections: [
    {
      name: 'Context',
      details: `- Background information about the situation
- What was being worked on
- Relevant environment or system details
- Any important constraints or requirements`,
    },
    {
      name: 'Problem',
      details: `- Description of the challenge or issue faced
- Initial symptoms or indicators
- Impact of the problem
- Why it was important to solve`,
    },
    {
      name: 'Solution',
      details: `- How the problem was approached
- Key steps in the solution process
- Tools or techniques used
- Important decisions made
- Final implementation details`,
    },
    {
      name: 'Impact',
      details: `- Results achieved
- Improvements made
- Benefits realized
- Metrics or evidence of success
- Time or resources saved`,
    },
    {
      name: 'Learnings',
      details: `- Key insights gained
- What worked well
- What could be done differently
- Advice for others
- Best practices identified
- Common pitfalls to avoid`,
    },
  ],
}; 