import { RequirementsClarificationService } from "../../application/services/RequirementsClarificationService";
import { LoggerPort } from "../../domain/ports";
import {
  QuestionCategory,
  SteeringContext,
  ClarificationAnalysis,
  ClarificationQuestion,
  EnrichedProjectDescription,
  ClarificationAnswers,
} from "../../domain/types";
import { SteeringContextLoader } from "../../application/services/SteeringContextLoader";
import { DescriptionAnalyzer } from "../../application/services/DescriptionAnalyzer";
import { QuestionGenerator } from "../../application/services/QuestionGenerator";
import { AnswerValidator } from "../../application/services/AnswerValidator";
import { DescriptionEnricher } from "../../application/services/DescriptionEnricher";

/**
 * Unit tests for RequirementsClarificationService (Orchestrator)
 *
 * These tests verify that the orchestrator correctly delegates to specialized services.
 * The specialized services themselves have their own comprehensive unit tests.
 */
describe("RequirementsClarificationService", () => {
  let service: RequirementsClarificationService;
  let mockLogger: jest.Mocked<LoggerPort>;
  let mockSteeringLoader: jest.Mocked<SteeringContextLoader>;
  let mockAnalyzer: jest.Mocked<DescriptionAnalyzer>;
  let mockQuestionGenerator: jest.Mocked<QuestionGenerator>;
  let mockAnswerValidator: jest.Mocked<AnswerValidator>;
  let mockEnricher: jest.Mocked<DescriptionEnricher>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as jest.Mocked<LoggerPort>;

    mockSteeringLoader = {
      loadContext: jest.fn(),
    } as unknown as jest.Mocked<SteeringContextLoader>;

    mockAnalyzer = {
      analyze: jest.fn(),
    } as unknown as jest.Mocked<DescriptionAnalyzer>;

    mockQuestionGenerator = {
      generateQuestions: jest.fn(),
    } as unknown as jest.Mocked<QuestionGenerator>;

    mockAnswerValidator = {
      validate: jest.fn(),
    } as unknown as jest.Mocked<AnswerValidator>;

    mockEnricher = {
      synthesize: jest.fn(),
    } as unknown as jest.Mocked<DescriptionEnricher>;

    service = new RequirementsClarificationService(
      mockLogger,
      mockSteeringLoader,
      mockAnalyzer,
      mockQuestionGenerator,
      mockAnswerValidator,
      mockEnricher,
    );
  });

  describe("analyzeDescription", () => {
    it("should delegate to SteeringContextLoader and DescriptionAnalyzer", async () => {
      const description = "Build a web app";
      const projectPath = "/test/project";

      const mockContext: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const mockAnalysis: ClarificationAnalysis = {
        qualityScore: 80,
        whyScore: 70,
        whoScore: 60,
        whatScore: 90,
        successScore: 50,
        missingElements: [],
        ambiguousTerms: [],
        needsClarification: false,
        hasWhy: true,
        hasWho: true,
        hasWhat: true,
        hasSuccessCriteria: true,
      };

      mockSteeringLoader.loadContext.mockResolvedValue(mockContext);
      mockAnalyzer.analyze.mockReturnValue(mockAnalysis);

      const result = await service.analyzeDescription(description, projectPath);

      expect(mockSteeringLoader.loadContext).toHaveBeenCalledWith(projectPath);
      expect(mockAnalyzer.analyze).toHaveBeenCalledWith(
        description,
        mockContext,
      );
      expect(result.needsClarification).toBe(false);
      expect(result.analysis).toEqual(mockAnalysis);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Analyzing project description for clarification needs",
        expect.any(Object),
      );
    });

    it("should return result without questions when clarification not needed", async () => {
      const description = "Complete description with all details";

      const mockContext: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const mockAnalysis: ClarificationAnalysis = {
        qualityScore: 85,
        whyScore: 80,
        whoScore: 80,
        whatScore: 90,
        successScore: 80,
        missingElements: [],
        ambiguousTerms: [],
        needsClarification: false,
        hasWhy: true,
        hasWho: true,
        hasWhat: true,
        hasSuccessCriteria: true,
      };

      mockSteeringLoader.loadContext.mockResolvedValue(mockContext);
      mockAnalyzer.analyze.mockReturnValue(mockAnalysis);

      const result = await service.analyzeDescription(description);

      expect(result.needsClarification).toBe(false);
      expect(result.analysis).toEqual(mockAnalysis);
      expect(result.questions).toBeUndefined();
      expect(mockQuestionGenerator.generateQuestions).not.toHaveBeenCalled();
    });

    it("should delegate to QuestionGenerator when clarification needed", async () => {
      const description = "Vague description";

      const mockContext: SteeringContext = {
        hasProductContext: false,
        hasTargetUsers: false,
        hasTechContext: false,
      };

      const mockAnalysis: ClarificationAnalysis = {
        qualityScore: 30,
        whyScore: 20,
        whoScore: 10,
        whatScore: 40,
        successScore: 0,
        missingElements: ["WHY", "WHO", "SUCCESS"],
        ambiguousTerms: [],
        needsClarification: true,
        hasWhy: false,
        hasWho: false,
        hasWhat: true,
        hasSuccessCriteria: false,
      };

      const mockQuestions: ClarificationQuestion[] = [
        {
          id: "why_problem",
          category: QuestionCategory.WHY,
          question: "What problem does this solve?",
          why: "Understanding the problem",
          examples: ["Example 1"],
          required: true,
        },
      ];

      mockSteeringLoader.loadContext.mockResolvedValue(mockContext);
      mockAnalyzer.analyze.mockReturnValue(mockAnalysis);
      mockQuestionGenerator.generateQuestions.mockReturnValue(mockQuestions);

      const result = await service.analyzeDescription(description);

      expect(result.needsClarification).toBe(true);
      expect(result.analysis).toEqual(mockAnalysis);
      expect(result.questions).toEqual(mockQuestions);
      expect(mockQuestionGenerator.generateQuestions).toHaveBeenCalledWith(
        mockAnalysis,
        mockContext,
      );
    });
  });

  describe("validateAnswers", () => {
    it("should delegate to AnswerValidator", () => {
      const questions: ClarificationQuestion[] = [
        {
          id: "q1",
          category: QuestionCategory.WHY,
          question: "Why?",
          why: "Rationale",
          examples: [],
          required: true,
        },
      ];

      const answers: ClarificationAnswers = {
        q1: "Because we need it",
      };

      const mockValidationResult = {
        valid: true,
        missingRequired: [],
        tooShort: [],
        containsInvalidContent: [],
      };

      mockAnswerValidator.validate.mockReturnValue(mockValidationResult);

      const result = service.validateAnswers(questions, answers);

      expect(mockAnswerValidator.validate).toHaveBeenCalledWith(
        questions,
        answers,
      );
      expect(result).toEqual(mockValidationResult);
    });
  });

  describe("synthesizeDescription", () => {
    it("should delegate to DescriptionEnricher", () => {
      const originalDescription = "Build a web app";
      const questions: ClarificationQuestion[] = [
        {
          id: "why_problem",
          category: QuestionCategory.WHY,
          question: "Why?",
          why: "Rationale",
          examples: [],
          required: true,
        },
      ];
      const answers: ClarificationAnswers = {
        why_problem: "To solve business problem X",
      };

      const mockEnrichedDescription: EnrichedProjectDescription = {
        original: originalDescription,
        why: "To solve business problem X",
        who: "",
        what: "",
        successCriteria: "",
        enriched:
          "## Original Description\nBuild a web app\n\n## Why\nTo solve business problem X",
      };

      mockEnricher.synthesize.mockReturnValue(mockEnrichedDescription);

      const result = service.synthesizeDescription(
        originalDescription,
        questions,
        answers,
      );

      expect(mockEnricher.synthesize).toHaveBeenCalledWith(
        originalDescription,
        questions,
        answers,
      );
      expect(result).toEqual(mockEnrichedDescription);
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Synthesizing enriched project description",
        expect.any(Object),
      );
    });
  });
});
