// Cross-platform compatibility and adaptation implementation

import { injectable, inject } from 'inversify';
import { platform, arch, release, version, homedir, tmpdir, EOL } from 'os';
import { sep, join, normalize, resolve, posix, win32 } from 'path';
import osLocale from 'os-locale';
import type { LoggerPort } from '../../domain/ports.js';
import type { 
  PlatformAdapter as IPlatformAdapter,
  SupportedLanguage,
  SystemInfo,
  Platform,
  Architecture
} from '../../domain/i18n/index.js';
import { TYPES } from '../di/types.js';

interface PlatformConfig {
  readonly pathSeparator: string;
  readonly lineEnding: string;
  readonly executableExtension: string;
  readonly configDirectory: string;
  readonly tempDirectory: string;
  readonly defaultShell: string;
  readonly maxPathLength: number;
  readonly caseSensitive: boolean;
  readonly supportedEncodings: string[];
}

interface EnvironmentInfo {
  readonly isProduction: boolean;
  readonly isDevelopment: boolean;
  readonly isTest: boolean;
  readonly nodeEnv: string;
  readonly processTitle: string;
  readonly workingDirectory: string;
  readonly userHome: string;
}

@injectable()
export class PlatformAdapter implements IPlatformAdapter {
  private readonly platformConfig: PlatformConfig;
  private cachedSystemInfo: SystemInfo | null = null;
  private cachedEnvironmentInfo: EnvironmentInfo | null = null;

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {
    this.platformConfig = this.initializePlatformConfig();
  }

  async detectLocale(): Promise<SupportedLanguage> {
    try {
      const systemLocale = await osLocale();
      const detectedLanguage = this.normalizeLocale(systemLocale);
      
      this.logger.debug('System locale detected', {
        raw: systemLocale,
        normalized: detectedLanguage
      });
      
      return detectedLanguage;
    } catch (error) {
      this.logger.warn('Failed to detect system locale, using English', {
        error: error instanceof Error ? error.message : String(error)
      });
      return SupportedLanguage.ENGLISH;
    }
  }

  async getSystemInfo(): Promise<SystemInfo> {
    if (this.cachedSystemInfo) {
      return this.cachedSystemInfo;
    }

    try {
      const systemInfo: SystemInfo = {
        platform: this.getPlatform(),
        arch: this.getArchitecture(),
        osVersion: release(),
        nodeVersion: version,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: await osLocale(),
        encoding: this.getDefaultEncoding()
      };

      this.cachedSystemInfo = systemInfo;
      
      this.logger.debug('System information collected', systemInfo);
      
      return systemInfo;
    } catch (error) {
      this.logger.error('Failed to collect system information', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  formatPath(inputPath: string): string {
    try {
      // Normalize the path for the current platform
      let normalizedPath = normalize(inputPath);
      
      // Handle cross-platform path separators
      if (this.isWindows()) {
        // Convert Unix-style paths to Windows-style
        normalizedPath = normalizedPath.replace(/\//g, '\\');
      } else {
        // Convert Windows-style paths to Unix-style
        normalizedPath = normalizedPath.replace(/\\/g, '/');
      }
      
      // Resolve relative paths
      if (!this.isAbsolutePath(normalizedPath)) {
        normalizedPath = resolve(normalizedPath);
      }
      
      // Validate path length
      if (normalizedPath.length > this.platformConfig.maxPathLength) {
        this.logger.warn('Path exceeds maximum length', {
          path: normalizedPath,
          length: normalizedPath.length,
          maxLength: this.platformConfig.maxPathLength
        });
      }
      
      return normalizedPath;
    } catch (error) {
      this.logger.error('Path formatting failed', {
        inputPath,
        error: error instanceof Error ? error.message : String(error)
      });
      return inputPath; // Return original path if formatting fails
    }
  }

  getEnvironmentVariables(): Record<string, string> {
    return { ...process.env } as Record<string, string>;
  }

  async getPreferredLanguages(): Promise<SupportedLanguage[]> {
    const preferredLanguages: SupportedLanguage[] = [];
    
    try {
      // Check environment variables for language preferences
      const envLang = process.env.LANG || process.env.LANGUAGE || process.env.LC_ALL;
      if (envLang) {
        const normalized = this.normalizeLocale(envLang);
        if (!preferredLanguages.includes(normalized)) {
          preferredLanguages.push(normalized);
        }
      }
      
      // Detect system locale
      const systemLocale = await this.detectLocale();
      if (!preferredLanguages.includes(systemLocale)) {
        preferredLanguages.push(systemLocale);
      }
      
      // Add fallback languages based on detected language
      const fallbacks = this.getFallbackLanguages(systemLocale);
      for (const fallback of fallbacks) {
        if (!preferredLanguages.includes(fallback)) {
          preferredLanguages.push(fallback);
        }
      }
      
      // Always include English as final fallback
      if (!preferredLanguages.includes(SupportedLanguage.ENGLISH)) {
        preferredLanguages.push(SupportedLanguage.ENGLISH);
      }
      
      this.logger.debug('Preferred languages determined', { preferredLanguages });
      
      return preferredLanguages;
    } catch (error) {
      this.logger.error('Failed to determine preferred languages', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [SupportedLanguage.ENGLISH];
    }
  }

  // Platform-specific utility methods
  isWindows(): boolean {
    return this.getPlatform() === Platform.WINDOWS;
  }

  isMacOS(): boolean {
    return this.getPlatform() === Platform.MACOS;
  }

  isLinux(): boolean {
    return this.getPlatform() === Platform.LINUX;
  }

  isUnix(): boolean {
    return !this.isWindows();
  }

  getPathSeparator(): string {
    return this.platformConfig.pathSeparator;
  }

  getLineEnding(): string {
    return this.platformConfig.lineEnding;
  }

  getExecutableExtension(): string {
    return this.platformConfig.executableExtension;
  }

  getConfigDirectory(): string {
    return this.platformConfig.configDirectory;
  }

  getTempDirectory(): string {
    return this.platformConfig.tempDirectory;
  }

  getDefaultShell(): string {
    return this.platformConfig.defaultShell;
  }

  isCaseSensitive(): boolean {
    return this.platformConfig.caseSensitive;
  }

  // File system utilities
  async getAvailableDiskSpace(path: string): Promise<number> {
    // This would require additional platform-specific implementation
    // For now, return a reasonable default
    return 1024 * 1024 * 1024; // 1GB
  }

  async createPlatformSpecificPath(...segments: string[]): Promise<string> {
    const joined = join(...segments);
    return this.formatPath(joined);
  }

  normalizePath(inputPath: string): string {
    if (this.isWindows()) {
      return win32.normalize(inputPath);
    } else {
      return posix.normalize(inputPath);
    }
  }

  // Environment information
  async getEnvironmentInfo(): Promise<EnvironmentInfo> {
    if (this.cachedEnvironmentInfo) {
      return this.cachedEnvironmentInfo;
    }

    const nodeEnv = process.env.NODE_ENV || 'development';
    
    const environmentInfo: EnvironmentInfo = {
      isProduction: nodeEnv === 'production',
      isDevelopment: nodeEnv === 'development',
      isTest: nodeEnv === 'test',
      nodeEnv,
      processTitle: process.title,
      workingDirectory: process.cwd(),
      userHome: homedir()
    };

    this.cachedEnvironmentInfo = environmentInfo;
    return environmentInfo;
  }

  // Private helper methods
  private initializePlatformConfig(): PlatformConfig {
    const currentPlatform = platform();
    
    switch (currentPlatform) {
      case 'win32':
        return {
          pathSeparator: '\\',
          lineEnding: '\r\n',
          executableExtension: '.exe',
          configDirectory: join(homedir(), 'AppData', 'Roaming'),
          tempDirectory: tmpdir(),
          defaultShell: 'cmd.exe',
          maxPathLength: 260,
          caseSensitive: false,
          supportedEncodings: ['utf8', 'utf16le', 'latin1', 'ascii']
        };
        
      case 'darwin':
        return {
          pathSeparator: '/',
          lineEnding: '\n',
          executableExtension: '',
          configDirectory: join(homedir(), 'Library', 'Preferences'),
          tempDirectory: tmpdir(),
          defaultShell: '/bin/bash',
          maxPathLength: 1024,
          caseSensitive: true,
          supportedEncodings: ['utf8', 'latin1', 'ascii']
        };
        
      default: // Linux and other Unix-like systems
        return {
          pathSeparator: '/',
          lineEnding: '\n',
          executableExtension: '',
          configDirectory: join(homedir(), '.config'),
          tempDirectory: tmpdir(),
          defaultShell: '/bin/bash',
          maxPathLength: 4096,
          caseSensitive: true,
          supportedEncodings: ['utf8', 'latin1', 'ascii']
        };
    }
  }

  private getPlatform(): Platform {
    const currentPlatform = platform();
    
    switch (currentPlatform) {
      case 'win32': return Platform.WINDOWS;
      case 'darwin': return Platform.MACOS;
      case 'linux': return Platform.LINUX;
      case 'freebsd': return Platform.FREEBSD;
      case 'openbsd': return Platform.OPENBSD;
      case 'sunos': return Platform.SUNOS;
      case 'aix': return Platform.AIX;
      default: return Platform.LINUX; // Default fallback
    }
  }

  private getArchitecture(): Architecture {
    const currentArch = arch();
    
    switch (currentArch) {
      case 'x64': return Architecture.X64;
      case 'arm64': return Architecture.ARM64;
      case 'arm': return Architecture.ARM;
      case 'ia32': return Architecture.IA32;
      case 'mips': return Architecture.MIPS;
      case 'mipsel': return Architecture.MIPSEL;
      case 'ppc': return Architecture.PPC;
      case 'ppc64': return Architecture.PPC64;
      case 's390': return Architecture.S390;
      case 's390x': return Architecture.S390X;
      default: return Architecture.X64; // Default fallback
    }
  }

  private normalizeLocale(locale: string): SupportedLanguage {
    const normalized = locale.toLowerCase().replace(/_/g, '-');
    
    // Direct matches
    if (normalized.startsWith('en')) return SupportedLanguage.ENGLISH;
    if (normalized.startsWith('ja')) return SupportedLanguage.JAPANESE;
    if (normalized.startsWith('ko')) return SupportedLanguage.KOREAN;
    if (normalized.startsWith('es')) return SupportedLanguage.SPANISH;
    if (normalized.startsWith('fr')) return SupportedLanguage.FRENCH;
    if (normalized.startsWith('de')) return SupportedLanguage.GERMAN;
    if (normalized.startsWith('pt')) return SupportedLanguage.PORTUGUESE;
    if (normalized.startsWith('ru')) return SupportedLanguage.RUSSIAN;
    
    // Chinese language detection
    if (normalized.startsWith('zh')) {
      if (normalized.includes('cn') || normalized.includes('hans')) {
        return SupportedLanguage.CHINESE_SIMPLIFIED;
      } else {
        return SupportedLanguage.CHINESE_TRADITIONAL;
      }
    }
    
    return SupportedLanguage.ENGLISH; // Default fallback
  }

  private getFallbackLanguages(language: SupportedLanguage): SupportedLanguage[] {
    const fallbacks: Record<SupportedLanguage, SupportedLanguage[]> = {
      [SupportedLanguage.CHINESE_SIMPLIFIED]: [SupportedLanguage.CHINESE_TRADITIONAL],
      [SupportedLanguage.CHINESE_TRADITIONAL]: [SupportedLanguage.CHINESE_SIMPLIFIED],
      [SupportedLanguage.KOREAN]: [SupportedLanguage.JAPANESE],
      [SupportedLanguage.JAPANESE]: [SupportedLanguage.KOREAN],
      [SupportedLanguage.SPANISH]: [SupportedLanguage.PORTUGUESE],
      [SupportedLanguage.PORTUGUESE]: [SupportedLanguage.SPANISH],
      [SupportedLanguage.FRENCH]: [SupportedLanguage.ENGLISH],
      [SupportedLanguage.GERMAN]: [SupportedLanguage.ENGLISH],
      [SupportedLanguage.RUSSIAN]: [SupportedLanguage.ENGLISH],
      [SupportedLanguage.ENGLISH]: []
    };
    
    return fallbacks[language] || [];
  }

  private isAbsolutePath(path: string): boolean {
    if (this.isWindows()) {
      return /^([a-zA-Z]:\\|\\\\)/.test(path);
    } else {
      return path.startsWith('/');
    }
  }

  private getDefaultEncoding(): string {
    // Platform-specific default encoding detection
    if (this.isWindows()) {
      return process.env.CHCP ? 'utf8' : 'latin1';
    } else {
      return 'utf8';
    }
  }
}