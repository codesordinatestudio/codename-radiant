export interface RadiantAST {
  collections: CollectionConfig[];
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
}

export interface CollectionConfig {
  slug: string;
  auth?: boolean;
  realtime?: {
    ws?: boolean;
    sse?: boolean;
    durableStream?: boolean;
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
  onInit: (app: any) => void | Promise<void>;
}
