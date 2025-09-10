// i18next-based internationalization service implementation

import { injectable, inject } from 'inversify';
import i18next, { type InitOptions, type TFunction } from 'i18next';
import Backend from 'i18next-fs-backend';
import { osLocale } from 'os-locale';
import path from 'path';
import type { LoggerPort } from '../../domain/ports.js';
import { 
  type I18nService,
  type I18nConfig,
  SupportedLanguage,
  type TranslationOptions,
  DetectionMethod,
  DetectionCacheMethod
} from '../../domain/i18n/index.js';
import { TYPES } from '../di/types.js';

const DEFAULT_I18N_CONFIG: I18nConfig = {
  defaultLanguage: SupportedLanguage.ENGLISH,
  fallbackLanguage: SupportedLanguage.ENGLISH,
  supportedLanguages: [
    SupportedLanguage.ENGLISH,
    SupportedLanguage.JAPANESE,
    SupportedLanguage.CHINESE_TRADITIONAL,
    SupportedLanguage.CHINESE_SIMPLIFIED,
    SupportedLanguage.KOREAN,
    SupportedLanguage.SPANISH,
    SupportedLanguage.FRENCH,
    SupportedLanguage.GERMAN
  ],
  autoDetect: true,
  resourcePath: './locales',
  namespaces: ['common', 'sdd', 'workflow', 'quality', 'templates', 'errors'],
  interpolation: {
    prefix: '{{',
    suffix: '}}',
    escapeValue: false,
    formatSeparator: ',',
    format: (value: unknown, format: string, language: SupportedLanguage) => {
      if (format === 'uppercase') return String(value).toUpperCase();
      if (format === 'lowercase') return String(value).toLowerCase();
      if (format === 'number' && typeof value === 'number') {
        return new Intl.NumberFormat(language).format(value);
      }
      if (format === 'currency' && typeof value === 'number') {
        return new Intl.NumberFormat(language, { style: 'currency', currency: 'USD' }).format(value);
      }
      return String(value);
    }
  },
  detection: {
    order: [DetectionMethod.ENVIRONMENT, DetectionMethod.HEADER, DetectionMethod.COOKIE],
    caches: [DetectionCacheMethod.COOKIE],
    cookieName: 'sdd-language',
    sessionName: 'sdd-language',
    headerName: 'accept-language',
    excludeCacheFor: []
  },
  cache: {
    enabled: true,
    prefix: 'sdd-i18n',
    expirationTime: 7 * 24 * 60 * 60 * 1000, // 7 days
    versions: {} as Record<SupportedLanguage, string>
  }
};

@injectable()
export class I18nextService implements I18nService {
  private initialized = false;
  private config: I18nConfig = DEFAULT_I18N_CONFIG;
  private i18nTranslate: TFunction = ((key: string) => key) as any;

  constructor(
    @inject(TYPES.LoggerPort) private readonly logger: LoggerPort
  ) {}

  async init(config: Partial<I18nConfig> = {}): Promise<void> {
    this.config = { ...DEFAULT_I18N_CONFIG, ...config };
    
    try {
      const detectedLanguage = await this.detectSystemLanguage();
      const initialLanguage = this.config.autoDetect 
        ? this.validateLanguage(detectedLanguage) 
        : this.config.defaultLanguage;

      const i18nOptions: InitOptions = {
        lng: initialLanguage,
        fallbackLng: this.config.fallbackLanguage,
        supportedLngs: this.config.supportedLanguages,
        preload: this.config.supportedLanguages,
        ns: this.config.namespaces,
        defaultNS: 'common',
        
        interpolation: {
          escapeValue: this.config.interpolation.escapeValue,
          prefix: this.config.interpolation.prefix,
          suffix: this.config.interpolation.suffix,
          formatSeparator: this.config.interpolation.formatSeparator,
          format: (value: unknown, format: string | undefined, language: string) => {
            if (!format) return String(value);
            return this.config.interpolation.format(value, format, language as SupportedLanguage);
          }
        },

        backend: {
          loadPath: path.join(this.config.resourcePath, '{{lng}}/{{ns}}.json'),
          addPath: path.join(this.config.resourcePath, '{{lng}}/{{ns}}.missing.json'),
          jsonIndent: 2
        },

        saveMissing: true,
        saveMissingTo: 'fallback',
        missingKeyHandler: (lngs: readonly string[], ns: string, key: string, fallbackValue: string, updateMissing: boolean, options: any) => {
          this.logger.warn('Missing translation key', {
            languages: Array.from(lngs),
            namespace: ns,
            key,
            fallbackValue
          });
        },

        debug: false,
        
        react: {
          useSuspense: false
        }
      };

      await i18next
        .use(Backend)
        .init(i18nOptions);

      this.i18nTranslate = i18next.t;
      this.initialized = true;

      this.logger.info('I18n service initialized', {
        language: initialLanguage,
        supportedLanguages: this.config.supportedLanguages,
        namespaces: this.config.namespaces
      });

    } catch (error) {
      this.logger.error('Failed to initialize i18n service', error instanceof Error ? error : new Error(String(error)));
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`I18n initialization failed: ${errorMessage}`);
    }
  }

  t(key: string, options?: TranslationOptions): string {
    if (!this.initialized) {
      this.logger.warn('I18n service not initialized, returning key', { key });
      return key;
    }

    try {
      const translation = this.i18nTranslate(key, options);
      
      if (translation === key && options?.defaultValue) {
        return options.defaultValue;
      }
      
      return translation;
    } catch (error) {
      this.logger.error('Translation error', error instanceof Error ? error : new Error(String(error)), {
        translationKey: key,
        translationOptions: options
      });
      return options?.defaultValue || key;
    }
  }

  async changeLanguage(language: SupportedLanguage): Promise<void> {
    if (!this.initialized) {
      throw new Error('I18n service not initialized');
    }

    if (!this.config.supportedLanguages.includes(language)) {
      throw new Error(`Language '${language}' is not supported`);
    }

    try {
      await i18next.changeLanguage(language);
      
      this.logger.info('Language changed', {
        previousLanguage: i18next.language,
        newLanguage: language
      });
    } catch (error) {
      this.logger.error('Failed to change language', error instanceof Error ? error : new Error(String(error)), {
        targetLanguage: language
      });
      throw error;
    }
  }

  getCurrentLanguage(): SupportedLanguage {
    if (!this.initialized) {
      return this.config.defaultLanguage;
    }
    
    return this.validateLanguage(i18next.language as SupportedLanguage);
  }

  getSupportedLanguages(): SupportedLanguage[] {
    return [...this.config.supportedLanguages];
  }

  addResourceBundle(language: SupportedLanguage, namespace: string, resources: Record<string, unknown>): void {
    if (!this.initialized) {
      this.logger.warn('Cannot add resource bundle - I18n service not initialized');
      return;
    }

    try {
      i18next.addResourceBundle(language, namespace, resources, true, true);
      
      this.logger.debug('Resource bundle added', {
        language,
        namespace,
        keysCount: Object.keys(resources).length
      });
    } catch (error) {
      this.logger.error('Failed to add resource bundle', error instanceof Error ? error : new Error(String(error)), {
        targetLanguage: language,
        resourceNamespace: namespace
      });
    }
  }

  async loadNamespace(namespace: string): Promise<void> {
    if (!this.initialized) {
      throw new Error('I18n service not initialized');
    }

    try {
      await i18next.loadNamespaces(namespace);
      
      this.logger.debug('Namespace loaded', { namespace });
    } catch (error) {
      this.logger.error('Failed to load namespace', error instanceof Error ? error : new Error(String(error)), {
        targetNamespace: namespace
      });
      throw error;
    }
  }

  exists(key: string, language?: SupportedLanguage): boolean {
    if (!this.initialized) {
      return false;
    }

    const options = language ? { lng: language } : undefined;
    return i18next.exists(key, options);
  }

  // Utility methods
  private async detectSystemLanguage(): Promise<string> {
    try {
      const systemLocale = await osLocale();
      return systemLocale;
    } catch (error) {
      this.logger.warn('Failed to detect system language, using default', {
        error: error instanceof Error ? error.message : String(error),
        default: this.config.defaultLanguage
      });
      return this.config.defaultLanguage;
    }
  }

  private validateLanguage(language: string): SupportedLanguage {
    // Try exact match first
    if (Object.values(SupportedLanguage).includes(language as SupportedLanguage)) {
      return language as SupportedLanguage;
    }

    // Try language code without region (e.g., 'en-US' -> 'en')
    const languageCode = language.split('-')[0];
    const matchedLanguage = Object.values(SupportedLanguage).find(
      lang => lang.startsWith(languageCode)
    );

    if (matchedLanguage) {
      return matchedLanguage;
    }

    // Try special cases
    switch (languageCode.toLowerCase()) {
      case 'zh':
        // Default to Traditional Chinese, could be made configurable
        return language.toLowerCase().includes('cn') || language.toLowerCase().includes('hans')
          ? SupportedLanguage.CHINESE_SIMPLIFIED
          : SupportedLanguage.CHINESE_TRADITIONAL;
      case 'es':
        return SupportedLanguage.SPANISH;
      case 'fr':
        return SupportedLanguage.FRENCH;
      case 'de':
        return SupportedLanguage.GERMAN;
      case 'ja':
        return SupportedLanguage.JAPANESE;
      case 'ko':
        return SupportedLanguage.KOREAN;
      case 'pt':
        return SupportedLanguage.PORTUGUESE;
      case 'ru':
        return SupportedLanguage.RUSSIAN;
      default:
        return this.config.defaultLanguage;
    }
  }

  // Advanced features
  async formatRelativeTime(date: Date, language?: SupportedLanguage): Promise<string> {
    const lang = language || this.getCurrentLanguage();
    const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
    
    const diffTime = date.getTime() - Date.now();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (Math.abs(diffDays) < 1) {
      const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
      if (Math.abs(diffHours) < 1) {
        const diffMinutes = Math.ceil(diffTime / (1000 * 60));
        return rtf.format(diffMinutes, 'minute');
      }
      return rtf.format(diffHours, 'hour');
    }
    
    return rtf.format(diffDays, 'day');
  }

  async formatNumber(
    number: number, 
    style: 'decimal' | 'currency' | 'percent' = 'decimal',
    currency?: string,
    language?: SupportedLanguage
  ): Promise<string> {
    const lang = language || this.getCurrentLanguage();
    
    const options: Intl.NumberFormatOptions = { style };
    if (style === 'currency' && currency) {
      options.currency = currency;
    }
    
    return new Intl.NumberFormat(lang, options).format(number);
  }

  async formatDate(
    date: Date,
    style: 'short' | 'medium' | 'long' | 'full' = 'medium',
    language?: SupportedLanguage
  ): Promise<string> {
    const lang = language || this.getCurrentLanguage();
    
    return new Intl.DateTimeFormat(lang, {
      dateStyle: style,
      timeStyle: style
    }).format(date);
  }

  async getPluralForm(count: number, language?: SupportedLanguage): Promise<string> {
    const lang = language || this.getCurrentLanguage();
    
    const pr = new Intl.PluralRules(lang);
    return pr.select(count);
  }

  // Resource management
  async getLoadedResources(): Promise<Record<string, Record<string, Record<string, unknown>>>> {
    if (!this.initialized) {
      return {};
    }
    
    return i18next.store.data as Record<string, Record<string, Record<string, unknown>>>;
  }

  async reloadResources(languages?: SupportedLanguage[], namespaces?: string[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('I18n service not initialized');
    }

    try {
      await i18next.reloadResources(languages, namespaces);
      this.logger.info('Resources reloaded', { languages, namespaces });
    } catch (error) {
      this.logger.error('Failed to reload resources', error instanceof Error ? error : new Error(String(error)), {
        targetLanguages: languages,
        targetNamespaces: namespaces
      });
      throw error;
    }
  }

  // Configuration getters
  getConfig(): I18nConfig {
    return { ...this.config };
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}