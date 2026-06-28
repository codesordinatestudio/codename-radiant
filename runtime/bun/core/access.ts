export interface AuthUser {
  id: string;
  role: string;
  [key: string]: any;
}

export interface RadiantRequestContext {
  request: Request;
  user: AuthUser | null;
}

export type AccessControlFunction = (ctx: RadiantRequestContext) => boolean | Promise<boolean>;

export interface AccessRules {
  read?: AccessControlFunction;
  create?: AccessControlFunction;
  update?: AccessControlFunction;
  delete?: AccessControlFunction;
}
