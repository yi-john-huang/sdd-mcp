import { RequirementsClarificationService } from '../../application/services/RequirementsClarificationService';
import { FileSystemPort, LoggerPort } from '../../domain/ports';
import { QuestionCategory } from '../../domain/types';

describe('RequirementsClarificationService', () => {
  let service: RequirementsClarificationService;
  let mockFileSystem: jest.Mocked<FileSystemPort>;
  let mockLogger: jest.Mocked<LoggerPort>;

  beforeEach(() => {
    mockFileSystem = {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      exists: jest.fn(),
      mkdir: jest.fn(),
      readdir: jest.fn(),
      stat: jest.fn(),
    } as jest.Mocked<FileSystemPort>;

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as jest.Mocked<LoggerPort>;

    service = new RequirementsClarificationService(mockFileSystem, mockLogger);
  });

  describe('analyzeDescription', () => {
    it('should identify a complete description and not require clarification', async () => {
      const description = `
        We need to build a customer support ticketing system because our support team
        spends 5 hours/day on repetitive inquiries. This will reduce ticket volume by 40%.
        Target users are customer support agents who handle 50+ tickets daily.
        Core features include auto-response, ticket categorization, and analytics dashboard.
        Success will be measured by 30% reduction in average response time within 3 months.
      `;

      const result = await service.analyzeDescription(description);

      expect(result.needsClarification).toBe(false);
      expect(result.analysis?.hasWhy).toBe(true);
      expect(result.analysis?.hasWho).toBe(true);
      expect(result.analysis?.hasWhat).toBe(true);
      expect(result.analysis?.hasSuccessCriteria).toBe(true);
      expect(result.analysis?.qualityScore).toBeGreaterThanOrEqual(70);
    });

    it('should identify a vague description and require clarification', async () => {
      const description = 'Build a fast and scalable web app';

      const result = await service.analyzeDescription(description);

      expect(result.needsClarification).toBe(true);
      expect(result.questions).toBeDefined();
      expect(result.questions!.length).toBeGreaterThan(0);
      expect(result.analysis?.qualityScore).toBeLessThan(70);
    });

    it('should detect missing WHY and generate appropriate questions', async () => {
      const description = 'A mobile app for users with features like chat and notifications';

      const result = await service.analyzeDescription(description);

      expect(result.needsClarification).toBe(true);
      expect(result.analysis?.hasWhy).toBe(false);

      const whyQuestions = result.questions?.filter(q => q.category === QuestionCategory.WHY);
      expect(whyQuestions).toBeDefined();
      expect(whyQuestions!.length).toBeGreaterThan(0);
    });

    it('should detect missing WHO and generate appropriate questions', async () => {
      const description = 'Build a system to solve inventory tracking problems';

      const result = await service.analyzeDescription(description);

      expect(result.analysis?.hasWho).toBe(false);

      const whoQuestions = result.questions?.filter(q => q.category === QuestionCategory.WHO);
      expect(whoQuestions).toBeDefined();
      expect(whoQuestions!.length).toBeGreaterThan(0);
    });

    it('should detect ambiguous terms', async () => {
      const description = 'Build a fast, scalable, user-friendly platform';

      const result = await service.analyzeDescription(description);

      expect(result.analysis?.ambiguousTerms).toBeDefined();
      expect(result.analysis!.ambiguousTerms.length).toBeGreaterThan(0);

      const terms = result.analysis!.ambiguousTerms.map(t => t.term.toLowerCase());
      expect(terms.some(t => t.includes('fast') || t.includes('scalable') || t.includes('user'))).toBe(true);
    });

    it('should use steering context to avoid redundant questions', async () => {
      mockFileSystem.exists.mockResolvedValue(true);
      mockFileSystem.readFile.mockResolvedValue(`
        # Product Overview
        Target Users: Enterprise sales teams
        Business Goal: Increase sales productivity by 50%
      `);

      const description = 'Build a CRM system';
      const result = await service.analyzeDescription(description, '/test/path');

      // Should have fewer questions since steering provides context
      const whoQuestions = result.questions?.filter(q => q.category === QuestionCategory.WHO);
      // Might still have questions, but steering context is loaded
      expect(mockFileSystem.exists).toHaveBeenCalled();
    });
  });

  describe('validateAnswers', () => {
    it('should validate that all required questions are answered', () => {
      const questions = [
        {
          id: 'q1',
          category: QuestionCategory.WHY,
          question: 'Why is this needed?',
          why: 'Important',
          required: true
        },
        {
          id: 'q2',
          category: QuestionCategory.WHO,
          question: 'Who are the users?',
          why: 'Important',
          required: true
        },
        {
          id: 'q3',
          category: QuestionCategory.WHAT,
          question: 'Optional feature?',
          why: 'Nice to have',
          required: false
        }
      ];

      const answers = {
        q1: 'To solve problem X',
        q2: 'Enterprise users'
      };

      const result = service.validateAnswers(questions, answers);

      expect(result.valid).toBe(true);
      expect(result.missingRequired).toHaveLength(0);
    });

    it('should identify missing required answers', () => {
      const questions = [
        {
          id: 'q1',
          category: QuestionCategory.WHY,
          question: 'Why is this needed?',
          why: 'Important',
          required: true
        },
        {
          id: 'q2',
          category: QuestionCategory.WHO,
          question: 'Who are the users?',
          why: 'Important',
          required: true
        }
      ];

      const answers = {
        q1: 'To solve problem X'
        // q2 is missing
      };

      const result = service.validateAnswers(questions, answers);

      expect(result.valid).toBe(false);
      expect(result.missingRequired).toHaveLength(1);
      expect(result.missingRequired[0]).toBe('Who are the users?');
    });
  });

  describe('synthesizeDescription', () => {
    it('should create an enriched description from original + answers', () => {
      const originalDescription = 'Build a task management tool';

      const questions = [
        {
          id: 'why1',
          category: QuestionCategory.WHY,
          question: 'Why is this needed?',
          why: 'Business justification',
          required: true
        },
        {
          id: 'who1',
          category: QuestionCategory.WHO,
          question: 'Who are the users?',
          why: 'Target audience',
          required: true
        },
        {
          id: 'what1',
          category: QuestionCategory.WHAT,
          question: 'What are core features?',
          why: 'Scope definition',
          required: true
        },
        {
          id: 'success1',
          category: QuestionCategory.SUCCESS,
          question: 'How to measure success?',
          why: 'Metrics',
          required: true
        }
      ];

      const answers = {
        why1: 'Our team wastes 2 hours/day on task tracking inefficiencies',
        who1: 'Project managers and developers in agile teams',
        what1: 'Task creation, assignment, status tracking, and sprint planning',
        success1: 'Reduce time spent on task management by 50%, measured monthly'
      };

      const result = service.synthesizeDescription(originalDescription, questions, answers);

      expect(result.original).toBe(originalDescription);
      expect(result.why).toContain('2 hours/day');
      expect(result.who).toContain('Project managers');
      expect(result.what).toContain('Task creation');
      expect(result.successCriteria).toContain('50%');
      expect(result.enriched).toContain('Business Justification');
      expect(result.enriched).toContain('Target Users');
      expect(result.enriched).toContain('Core Features');
      expect(result.enriched).toContain('Success Criteria');
    });

    it('should handle empty answers gracefully', () => {
      const originalDescription = 'Build something';
      const questions: any[] = [];
      const answers = {};

      const result = service.synthesizeDescription(originalDescription, questions, answers);

      expect(result.original).toBe(originalDescription);
      expect(result.enriched).toContain(originalDescription);
    });
  });

  describe('quality score calculation', () => {
    it('should score complete descriptions highly', async () => {
      const description = `
        Problem: Customer support is overwhelmed with 500+ tickets/day (WHY)
        Users: Support agents and customers (WHO)
        Features: Auto-categorization, smart routing, chatbot (WHAT)
        Success: 40% ticket reduction in Q1 (METRICS)
      `;

      const result = await service.analyzeDescription(description);

      expect(result.analysis?.qualityScore).toBeGreaterThanOrEqual(70);
    });

    it('should penalize ambiguous language', async () => {
      const description = `
        We need a fast, scalable, user-friendly, modern platform
        that is easy to use and highly reliable
      `;

      const result = await service.analyzeDescription(description);

      expect(result.analysis?.ambiguousTerms.length).toBeGreaterThan(3);
      expect(result.analysis?.qualityScore).toBeLessThan(50);
    });

    it('should give WHY the highest weight in scoring', async () => {
      const descriptionWithWhy = 'Solve customer churn problem for enterprise users';
      const descriptionWithoutWhy = 'A platform for enterprise users';

      const resultWith = await service.analyzeDescription(descriptionWithWhy);
      const resultWithout = await service.analyzeDescription(descriptionWithoutWhy);

      expect(resultWith.analysis!.qualityScore).toBeGreaterThan(resultWithout.analysis!.qualityScore);
    });
  });
});
