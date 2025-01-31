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
  problemsSolved: [
    {
      questionId: '3.1',
      question:
        'What problem does the invention solve? For every problem, include the problem, prior approaches, and how the invention improves the situation.',
    },
  ],
  introduction: [
    {
      questionId: '4.1',
      question:
        'Find out all the concepts required by the description. Describe each concept in detail.',
    },
  ],
  whatAndHow: [
    {
      questionId: '5.1',
      question: 'What are the processing steps in the invention?',
    },
    {
      questionId: '5.2',
      question: 'What are some case studies that show the benefits of the invention?',
    },
  ],
  pseudoCode: [
    {
      questionId: '6.1',
      question:
        'What is the pseudo code for the invention? You must come up with this after understanding the details from the user.',
    },
    {
      questionId: '6.2',
      question: 'What are the comments for the pseudo code?',
    },
    {
      questionId: '6.3',
      question:
        'What is the flowchart for the invention? Use graphviz DOT language to create the flowchart. You must come up with this after understanding the details from the user.',
    },
  ],
  dataStructures: [
    {
      questionId: '7.1',
      question:
        'What are the data structures used in the invention? For each, identify the name, fields and diagram in graphviz DOT language if applicable. You must come up with this after understanding the details from the user.',
    },
  ],
  implementationDetails: [
    {
      questionId: '8.1',
      question: 'What are the configuration settings of the invention?',
    },
    {
      questionId: '8.2',
      question: 'What are the AI training details of the invention?',
    },
    {
      questionId: '8.3',
      question: 'What is the implementation choice rationale?',
    },
  ],
  alternatives: [
    {
      questionId: '9.1',
      question:
        'What are the alternative to the invention? For each alternative, include the name, description, and disadvantage of that alternative',
    },
  ],
};
