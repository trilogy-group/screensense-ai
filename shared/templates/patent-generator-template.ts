import { PatentTemplate } from '../types/patent';

export const patentGeneratorTemplate: PatentTemplate = {
  title: 'New Patent',
  sections: [
    {
      name: 'Executive Summary',
      details: `- Clearly conveys the core invention and value proposition 
- Touches on key elements like problem solved, novelty, benefits
- Is concise yet informative - can stand on its own
- Uses clear, non-technical language suitable for executives`,
    },
    {
      name: 'Context/Environment',
      details: `- Specifies the domain and use case(s) 
- Differentiates where invention is used vs. potential applicability
- Provides relevant context to understand invention's purpose`,
    },
    {
      name: 'Problems Solved',
      details: `- Articulates specific shortcomings in prior approaches
- Contrasts how invention improves on the state of the art
- Demonstrates insight into the problem space and customer needs`,
    },
    {
      name: 'Introduction',
      details: `- Provides relevant background for core concepts used (e.g. algorithms)
- Explains key building blocks at an appropriate level of detail
- Sets the stage to understand implementation details`,
    },
    {
      name: 'What and How',
      details: `- Details each processing step from input to output
- Specifies data sources, formats, and models
- Describes key algorithms, operations, and modules
- Provides working code samples or detailed pseudo-code
- Includes case studies demonstrating real-world usage
- Specifies key constraints, settings and configuration details
- Covers failure modes and error handling`,
    },
    {
      name: 'Pseudo Code',
      details: `- Captures core logic and flow of the invention
- Uses clear naming for variables and functions
- Includes comments explaining key steps
- Is syntactically correct and complete
- Matches details provided in What & How`,
    },
    {
      name: 'Data Structures',
      details: `- Covers all core data structures used in implementation
- Specifies fields and data types
- Provides visual representations (e.g. schema diagrams)
- Explains how data structures are used in the invention`,
    },
    {
      name: 'Implementation Details',
      details: `- Provides implementation specifics beyond high-level What & How
- Details key configuration settings and rationale
- Covers training details for ML/AI components
- Discusses tradeoffs and rationale for implementation choices`,
    },
    {
      name: 'Alternatives',
      details: `- Surveys prior art and alternative approaches
- Demonstrates awareness of the competitive landscape
- Articulates specific disadvantages of each alternative
- Highlights invention's advantages over alternatives`,
    },
  ],
};
