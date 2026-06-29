import { IToken } from 'chevrotain';

export class SemanticError extends Error {
  public token: IToken;
  public uri?: string;
  constructor(message: string, token: IToken, uri?: string) {
    super(message);
    this.token = token;
    this.uri = uri;
    this.name = 'SemanticError';
  }
}

const ALLOWED_CONFIG = new Set(['core', 'security', 'monitoring', 'adminUI', 'apiPrefix']);
const ALLOWED_CORE = new Set(['api', 'openapi', 'upload']);
const ALLOWED_SECURITY = new Set(['auth', 'cors', 'rateLimit', 'headers', 'secrets', 'audit']);
const ALLOWED_AUTH = new Set(['strategies', 'jwt', 'session', 'apiKey', 'passwordPolicy', 'lockout']);
const ALLOWED_MONITORING = new Set(['healthCheck', 'requestId']);
const ALLOWED_COLLECTION = new Set(['auth', 'fields', 'realtime', 'cache', 'hooks', 'admin']);

export function compile(rawAsts: any[]): { schema: any, errors: SemanticError[] } {
  const schema: any = {
    collections: []
  };
  const errors: SemanticError[] = [];
  const seenCollections = new Map<string, IToken>();

  for (const ast of rawAsts) {
    if (!ast || !ast.blocks) continue;
    for (const block of ast.blocks) {
      if (block.type === 'config') {
        block.body.forEach((prop: any) => {
          if (!ALLOWED_CONFIG.has(prop.name)) {
             errors.push(new SemanticError(`Unknown property '${prop.name}' in config block.`, prop.nameToken, ast.uri));
          }
          if (prop.name === 'core') {
             if (prop.value && prop.value.type === 'object' && Array.isArray(prop.value.properties)) {
                prop.value.properties.forEach((coreProp: any) => {
                   if (!ALLOWED_CORE.has(coreProp.name)) {
                      errors.push(new SemanticError(`Unknown property '${coreProp.name}' in core block.`, coreProp.nameToken, ast.uri));
                   }
                });
             } else {
                errors.push(new SemanticError(`Expected an object block for 'core'`, prop.nameToken, ast.uri));
             }
          }
          if (prop.name === 'security') {
             if (prop.value && prop.value.type === 'object' && Array.isArray(prop.value.properties)) {
                prop.value.properties.forEach((secProp: any) => {
                   if (!ALLOWED_SECURITY.has(secProp.name)) {
                      errors.push(new SemanticError(`Unknown property '${secProp.name}' in security block.`, secProp.nameToken, ast.uri));
                   }
                   if (secProp.name === 'auth' && secProp.value && secProp.value.type === 'object' && Array.isArray(secProp.value.properties)) {
                      secProp.value.properties.forEach((authProp: any) => {
                         if (!ALLOWED_AUTH.has(authProp.name)) {
                            errors.push(new SemanticError(`Unknown property '${authProp.name}' in auth block.`, authProp.nameToken, ast.uri));
                         }
                      });
                   }
                });
             } else {
                errors.push(new SemanticError(`Expected an object block for 'security'`, prop.nameToken, ast.uri));
             }
          }
          if (prop.name === 'monitoring') {
             if (prop.value && prop.value.type === 'object' && Array.isArray(prop.value.properties)) {
                prop.value.properties.forEach((monProp: any) => {
                   if (!ALLOWED_MONITORING.has(monProp.name)) {
                      errors.push(new SemanticError(`Unknown property '${monProp.name}' in monitoring block.`, monProp.nameToken, ast.uri));
                   }
                });
             } else {
                errors.push(new SemanticError(`Expected an object block for 'monitoring'`, prop.nameToken, ast.uri));
             }
          }

          schema[prop.name] = compileValue(prop.value);
        });
      } else if (block.type === 'collection') {
        if (seenCollections.has(block.name)) {
           errors.push(new SemanticError(`Duplicate collection name '${block.name}' defined.`, block.nameToken, ast.uri));
        } else {
           seenCollections.set(block.name, block.nameToken);
        }

        const col: any = {
          slug: block.name,
          uri: ast.uri,
          fields: []
        };
        block.body.forEach((prop: any) => {
          if (!ALLOWED_COLLECTION.has(prop.name)) {
             errors.push(new SemanticError(`Unknown property '${prop.name}' in collection block.`, prop.nameToken, ast.uri));
          }
          if (prop.name === 'fields') {
             if (prop.value && prop.value.type === 'object') {
                prop.value.properties.forEach((field: any) => {
                   col.fields.push(compileField(field));
                });
             }
          } else {
             col[prop.name] = compileValue(prop.value);
          }
        });
        schema.collections.push(col);
      }
    }
  }

  // Basic Validation
  for (const col of schema.collections) {
    for (const field of col.fields) {
      if (field.type === 'link') {
        if (!seenCollections.has(field.target)) {
           errors.push(new SemanticError(`Validation Error: Collection '${col.slug}' links to a non-existent collection '${field.target}'.`, field.targetToken, col.uri));
        }
      }
    }
  }

  return { schema, errors };
}

function compileValue(val: any): any {
  if (val && typeof val === 'object') {
     if (val.type === 'object') {
        const obj: any = {};
        val.properties.forEach((p: any) => {
           obj[p.name] = compileValue(p.value);
        });
        return obj;
     }
     if (val.type === 'array') {
        return val.elements.map(compileValue);
     }
     if (val.type === 'identifier') {
        return val.name;
     }
     if (val.type === 'function' && val.name === 'env') {
        if (!val.args || val.args.length === 0 || typeof val.args[0] !== 'string') {
           throw new Error("env() manipulator requires at least one string argument for the environment variable name.");
        }
        return {
           $env: val.args[0],
           $default: val.args[1] !== undefined ? val.args[1] : null
        };
     }
  }
  return val;
}

function compileField(field: any): any {
  const result: any = {
    name: field.name,
  };
  
  if (field.value && typeof field.value === 'object') {
    if (field.value.type === 'identifier') {
       result.type = field.value.name;
    } else if (field.value.type === 'function') {
       result.type = field.value.name; // e.g. "link"
       if (field.value.name === 'link' && field.value.args.length > 0) {
          result.target = field.value.args[0]; // Wait, if args is a string literal, we don't have its token!
          // But we attached token to functionOrIdentifier itself! Let's use the function token.
          result.targetToken = field.value.token;
       }
    } else if (field.value.type === 'array') {
       result.type = 'enum';
       result.values = field.value.elements;
    } else if (field.value.type === 'object') {
       result.type = 'object';
       result.fields = [];
       field.value.properties.forEach((p: any) => result.fields.push(compileField(p)));
    }
  } else {
    result.type = field.value; 
  }

  if (field.isArray) {
    result.isArray = true;
  }

  if (field.decorators && field.decorators.length > 0) {
     field.decorators.forEach((dec: any) => {
        if (dec.name === 'unique') result.unique = true;
        else if (dec.name === 'optional') result.optional = true;
        else if (dec.name === 'default') result.default = dec.args[0];
     });
  }

  return result;
}
