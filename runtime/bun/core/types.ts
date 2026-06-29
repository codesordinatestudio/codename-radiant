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
