import { PatentTemplate } from '../types/patent';

export const patentGeneratorTemplate: PatentTemplate = {
  title: 'New Patent',
  executiveSummary: [
    {
      questionId: '1.1',
      question: 'What is the brief overview of the invention?',
    },
    {
      questionId: '1.2',
      question: 'What are the key benefits of the invention?',
    },
    {
      questionId: '1.3',
      question: 'What is the value proposition of the invention?',
    },
  ],
  context: [
    {
      questionId: '2.1',
      question: 'What is the domain of the invention?',
    },
    {
      questionId: '2.2',
      question: 'What use cases does the invention address?',
    },
    {
      questionId: '2.3',
      question: 'What is the potential applicability of the invention?',
    },
  ],
};
