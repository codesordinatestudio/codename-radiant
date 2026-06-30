import type { RadiantRequestContext } from "../main/access";

export interface RadiantAST {
  collections: CollectionConfig[];
  globals?: CollectionConfig[];
  core?: {
    api?: {
      prefix?: string;
      maxBodyBytes?: number;
      trustedProxies?: string[];
    };
  };
  adminUI?: {
    enabled?: boolean;
    user?: string;
  };
  migrate?: {
    dropOrphan?: boolean;
  };
  security?: {
    auth?: {
      strategies?: string[];
      jwt?: {
        accessTokenExpiry?: string;
        refreshTokenExpiry?: string;
        cookies?: {
          enabled?: boolean;
        };
      };
      passwordPolicy?: {
        minLength?: number;
        requireUppercase?: boolean;
        requireNumber?: boolean;
      };
      lockout?: {
        maxAttempts?: number;
        durationMinutes?: number;
      };
    };
    cors?: {
      origin?: string[];
      credentials?: boolean;
    };
    rateLimit?: {
      write?: { max?: number; window?: string; };
      login?: { max?: number; window?: string; };
    };
    headers?: { enabled?: boolean; };
    secrets?: { enabled?: boolean; };
    audit?: { enabled?: boolean; };
  };
  monitoring?: {
    healthCheck?: {
      enabled?: boolean;
      path?: string;
      requiresAuth?: boolean;
    };
    requestId?: {
      enabled?: boolean;
    };
  };
  email?: {
    from?: string;
    appName?: string;
    resetTokenExpiryMinutes?: number;
    resetPasswordUrl?: string;
    verifyEmailUrl?: string;
  };
}

export interface CollectionConfig {
  slug: string;
  auth?: boolean;
  realtime?: {
    secure?: boolean;
    ws?: boolean | string[];
    sse?: boolean | string[];
    durableStream?: boolean | string[];
  };
  cache?: {
    ttl?: string | number;
    strategy?: "stale-while-revalidate" | string;
  };
  fields: FieldConfig[];
}

export interface FieldConfig {
  name: string;
  type: string;
  unique?: boolean;
  optional?: boolean;
  default?: any;
  target?: string; // For link fields
  values?: string[]; // For enum fields
}

export interface UploadedFile {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  url: string;
}

export interface StorageProvider {
  saveFile(file: File, options?: { filename?: string }): Promise<UploadedFile>;
  deleteFile(filename: string): Promise<void>;
}

export interface CacheStore {
  get(key: string): Promise<any | null>;
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<number>;
  close(): void;
}

export interface RadiantPlugin {
  name: string;
  onInit?: (app: any) => void | Promise<void>;
  beforeRequest?: (ctx: RadiantRequestContext) => void | Promise<void>;
  afterRequest?: (ctx: RadiantRequestContext, response: Response) => void | Promise<void>;
  onError?: (ctx: RadiantRequestContext, error: any) => Response | void | Promise<Response | void>;
}

export interface RadiantEmailSendOptions {
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  subject?: string;
  text?: string;
  html?: string;
}

export interface RadiantEmailTransport {
  send(options: RadiantEmailSendOptions): Promise<{ messageId: string }>;
  verify(): Promise<boolean>;
}

export interface EmailTemplates {
  welcome?: (data: { to: string; appName: string }) => { subject?: string; html: string; text?: string };
  forgotPassword?: (data: { to: string; resetUrl: string; appName: string; expiresInMinutes: number }) => { subject?: string; html: string; text?: string };
  passwordResetSuccess?: (data: { to: string; appName: string }) => { subject?: string; html: string; text?: string };
  verifyEmail?: (data: { to: string; verifyUrl: string; appName: string }) => { subject?: string; html: string; text?: string };
}

export interface EmailConfig {
  from?: string;
  appName?: string;
  resetTokenExpiryMinutes?: number;
  resetPasswordUrl?: string;
  verifyEmailUrl?: string;
  transport?: RadiantEmailTransport;
  templates?: EmailTemplates;
}
