// Domain models and interfaces for internationalization

export interface I18nService {
  init(config: I18nConfig): Promise<void>;
  t(key: string, options?: TranslationOptions): string;
  changeLanguage(language: SupportedLanguage): Promise<void>;
  getCurrentLanguage(): SupportedLanguage;
  getSupportedLanguages(): SupportedLanguage[];
  addResourceBundle(language: SupportedLanguage, namespace: string, resources: Record<string, unknown>): void;
  loadNamespace(namespace: string): Promise<void>;
  exists(key: string, language?: SupportedLanguage): boolean;
}

export interface I18nConfig {
  readonly defaultLanguage: SupportedLanguage;
  readonly fallbackLanguage: SupportedLanguage;
  readonly supportedLanguages: SupportedLanguage[];
  readonly autoDetect: boolean;
  readonly resourcePath: string;
  readonly namespaces: string[];
  readonly interpolation: InterpolationConfig;
  readonly detection: DetectionConfig;
  readonly cache: CacheConfig;
}

export interface TranslationOptions {
  readonly [key: string]: unknown;
  readonly count?: number;
  readonly context?: string;
  readonly defaultValue?: string;
  readonly lng?: SupportedLanguage;
  readonly ns?: string | string[];
}

export interface InterpolationConfig {
  readonly prefix: string;
  readonly suffix: string;
  readonly escapeValue: boolean;
  readonly formatSeparator: string;
  readonly format: (value: unknown, format: string, language: SupportedLanguage) => string;
}

export interface DetectionConfig {
  readonly order: DetectionMethod[];
  readonly caches: DetectionCacheMethod[];
  readonly cookieName: string;
  readonly sessionName: string;
  readonly headerName: string;
  readonly excludeCacheFor: SupportedLanguage[];
}

export interface CacheConfig {
  readonly enabled: boolean;
  readonly prefix: string;
  readonly expirationTime: number; // in milliseconds
  readonly versions: Record<SupportedLanguage, string>;
}

export interface LocaleInfo {
  readonly code: SupportedLanguage;
  readonly name: string;
  readonly nativeName: string;
  readonly region: string;
  readonly direction: TextDirection;
  readonly pluralRules: PluralRule[];
  readonly dateFormats: DateFormatPatterns;
  readonly numberFormats: NumberFormatPatterns;
  readonly currency: CurrencyInfo;
  readonly timeZone: string;
}

export interface PluralRule {
  readonly form: PluralForm;
  readonly condition: string;
  readonly examples: number[];
}

export interface DateFormatPatterns {
  readonly short: string;
  readonly medium: string;
  readonly long: string;
  readonly full: string;
  readonly time: string;
  readonly dateTime: string;
}

export interface NumberFormatPatterns {
  readonly decimal: string;
  readonly percent: string;
  readonly currency: string;
  readonly scientific: string;
  readonly grouping: string;
}

export interface CurrencyInfo {
  readonly code: string;
  readonly symbol: string;
  readonly name: string;
  readonly decimalPlaces: number;
}

export interface TranslationResource {
  readonly namespace: string;
  readonly language: SupportedLanguage;
  readonly version: string;
  readonly keys: Record<string, TranslationEntry>;
  readonly metadata: ResourceMetadata;
}

export interface TranslationEntry {
  readonly value: string | Record<string, string>;
  readonly description?: string;
  readonly context?: string;
  readonly plurals?: Record<PluralForm, string>;
  readonly maxLength?: number;
  readonly examples?: string[];
}

export interface ResourceMetadata {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly translators: string[];
  readonly reviewers: string[];
  readonly status: TranslationStatus;
  readonly completeness: number; // 0-100%
}

export interface PlatformAdapter {
  detectLocale(): Promise<SupportedLanguage>;
  getSystemInfo(): Promise<SystemInfo>;
  formatPath(path: string): string;
  getEnvironmentVariables(): Record<string, string>;
  getPreferredLanguages(): Promise<SupportedLanguage[]>;
}

export interface SystemInfo {
  readonly platform: Platform;
  readonly arch: Architecture;
  readonly osVersion: string;
  readonly nodeVersion: string;
  readonly timezone: string;
  readonly locale: string;
  readonly encoding: string;
}

export interface LanguagePack {
  readonly language: SupportedLanguage;
  readonly version: string;
  readonly resources: TranslationResource[];
  readonly templates: LocalizedTemplate[];
  readonly formats: LocaleFormats;
  readonly validators: LocaleValidator[];
}

export interface LocalizedTemplate {
  readonly name: string;
  readonly category: TemplateCategory;
  readonly content: string;
  readonly variables: LocalizedVariable[];
}

export interface LocalizedVariable {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly placeholder: string;
  readonly validation: LocaleValidator[];
}

export interface LocaleFormats {
  readonly date: DateFormatPatterns;
  readonly number: NumberFormatPatterns;
  readonly currency: CurrencyInfo;
  readonly address: AddressFormat;
  readonly phone: PhoneFormat;
}

export interface AddressFormat {
  readonly pattern: string;
  readonly components: AddressComponent[];
  readonly postalCodePattern: string;
}

export interface PhoneFormat {
  readonly pattern: string;
  readonly countryCode: string;
  readonly nationalPrefix: string;
}

export interface AddressComponent {
  readonly name: string;
  readonly required: boolean;
  readonly maxLength: number;
}

export interface LocaleValidator {
  readonly type: ValidationType;
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly message: string;
}

// Enums and types
export enum SupportedLanguage {
  ENGLISH = 'en',
  JAPANESE = 'ja',
  CHINESE_TRADITIONAL = 'zh-TW',
  CHINESE_SIMPLIFIED = 'zh-CN',
  KOREAN = 'ko',
  SPANISH = 'es',
  FRENCH = 'fr',
  GERMAN = 'de',
  PORTUGUESE = 'pt',
  RUSSIAN = 'ru'
}

export enum DetectionMethod {
  PATH = 'path',
  HEADER = 'header',
  COOKIE = 'cookie',
  SESSION = 'session',
  QUERY = 'querystring',
  SUBDOMAIN = 'subdomain',
  HTML_TAG = 'htmlTag',
  ENVIRONMENT = 'environment'
}

export enum DetectionCacheMethod {
  COOKIE = 'cookie',
  SESSION = 'session',
  LOCAL_STORAGE = 'localStorage',
  MEMORY = 'memory'
}

export enum TextDirection {
  LTR = 'ltr',
  RTL = 'rtl'
}

export enum PluralForm {
  ZERO = 'zero',
  ONE = 'one',
  TWO = 'two',
  FEW = 'few',
  MANY = 'many',
  OTHER = 'other'
}

export enum TranslationStatus {
  DRAFT = 'draft',
  IN_REVIEW = 'in-review',
  APPROVED = 'approved',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated'
}

export enum Platform {
  WINDOWS = 'win32',
  MACOS = 'darwin',
  LINUX = 'linux',
  FREEBSD = 'freebsd',
  OPENBSD = 'openbsd',
  SUNOS = 'sunos',
  AIX = 'aix'
}

export enum Architecture {
  X64 = 'x64',
  ARM64 = 'arm64',
  ARM = 'arm',
  IA32 = 'ia32',
  MIPS = 'mips',
  MIPSEL = 'mipsel',
  PPC = 'ppc',
  PPC64 = 'ppc64',
  S390 = 's390',
  S390X = 's390x'
}

export enum TemplateCategory {
  SDD = 'sdd',
  DOCUMENTATION = 'documentation',
  COMMUNICATION = 'communication',
  SYSTEM = 'system'
}

export enum ValidationType {
  PATTERN = 'pattern',
  LENGTH = 'length',
  NUMERIC = 'numeric',
  EMAIL = 'email',
  URL = 'url',
  DATE = 'date',
  PHONE = 'phone',
  POSTAL_CODE = 'postalCode'
}

// Port interfaces
export interface I18nManagerPort {
  initialize(config: I18nConfig): Promise<void>;
  getLocaleInfo(language: SupportedLanguage): Promise<LocaleInfo>;
  loadLanguagePack(language: SupportedLanguage): Promise<LanguagePack>;
  getAvailableLanguages(): Promise<SupportedLanguage[]>;
  validateTranslation(key: string, value: string, language: SupportedLanguage): Promise<ValidationResult>;
  formatMessage(key: string, params: Record<string, unknown>, language?: SupportedLanguage): Promise<string>;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ValidationError[];
  readonly warnings: ValidationWarning[];
  readonly suggestions: string[];
}

export interface ValidationError {
  readonly type: ValidationType;
  readonly message: string;
  readonly field?: string;
  readonly value?: unknown;
}

export interface ValidationWarning {
  readonly type: string;
  readonly message: string;
  readonly suggestion: string;
}