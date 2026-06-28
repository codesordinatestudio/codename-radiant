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
  security?: any;
  monitoring?: any;
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
