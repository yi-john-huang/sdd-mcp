import { injectable, inject } from "inversify";
import { TYPES } from "../../infrastructure/di/types.js";
import { FileSystemPort, LoggerPort } from "../../domain/ports.js";
import { SteeringContext } from "../../domain/types.js";
import {
  QUALITY_SCORE_WEIGHTS,
  PATTERN_DETECTION,
} from "./clarification-constants.js";

@injectable()
export class SteeringContextLoader {
  constructor(
    @inject(TYPES.FileSystemPort) private readonly fileSystem: FileSystemPort,
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort,
  ) {}

  /**
   * Load steering documents from filesystem
   */
  async loadContext(projectPath?: string): Promise<SteeringContext> {
    const defaultContext: SteeringContext = {
      hasProductContext: false,
      hasTargetUsers: false,
      hasTechContext: false,
    };

    if (!projectPath) {
      return defaultContext;
    }

    try {
      let hasProductContext = false;
      let hasTargetUsers = false;
      let hasTechContext = false;

      // Load product.md with individual error handling
      const productPath = `${projectPath}/.spec/steering/product.md`;
      if (await this.fileSystem.exists(productPath)) {
        try {
          const content = await this.fileSystem.readFile(productPath);
          hasProductContext =
            content.length > QUALITY_SCORE_WEIGHTS.MIN_STEERING_CONTENT_LENGTH;
          hasTargetUsers = PATTERN_DETECTION.TARGET_USERS_PATTERN.test(content);
        } catch (err) {
          this.logger.debug("Failed to load product.md", {
            error: (err as Error).message,
          });
        }
      }

      // Load tech.md with individual error handling
      const techPath = `${projectPath}/.spec/steering/tech.md`;
      if (await this.fileSystem.exists(techPath)) {
        try {
          const content = await this.fileSystem.readFile(techPath);
          hasTechContext =
            content.length > QUALITY_SCORE_WEIGHTS.MIN_STEERING_CONTENT_LENGTH;
        } catch (err) {
          this.logger.debug("Failed to load tech.md", {
            error: (err as Error).message,
          });
        }
      }

      return {
        hasProductContext,
        hasTargetUsers,
        hasTechContext,
      };
    } catch (err) {
      this.logger.warn("Failed to load steering context, using defaults", {
        error: (err as Error).message,
        projectPath,
      });
      return defaultContext;
    }
  }
}
