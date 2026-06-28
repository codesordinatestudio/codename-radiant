import { createToken, Lexer, TokenType } from 'chevrotain';

// Comments & Whitespace
export const WhiteSpace = createToken({
  name: 'WhiteSpace',
  pattern: /[ \t\n\r]+/,
  group: Lexer.SKIPPED
});

export const Comment = createToken({
  name: 'Comment',
  pattern: /\/\/[^\n\r]*/,
  group: Lexer.SKIPPED
});

// Keywords
export const Config = createToken({ name: 'Config', pattern: /config/ });
export const Collection = createToken({ name: 'Collection', pattern: /collection/ });
export const Fields = createToken({ name: 'Fields', pattern: /fields/ });

export const True = createToken({ name: 'True', pattern: /true/ });
export const False = createToken({ name: 'False', pattern: /false/ });

// Decorator token: e.g. @unique
export const Decorator = createToken({ name: 'Decorator', pattern: /@[a-zA-Z_][a-zA-Z0-9_]*/ });

// Identifier
export const Identifier = createToken({ name: 'Identifier', pattern: /[a-zA-Z_][a-zA-Z0-9_]*/ });

// Punctuation
export const LCurly = createToken({ name: 'LCurly', pattern: /\{/ });
export const RCurly = createToken({ name: 'RCurly', pattern: /\}/ });
export const LSquare = createToken({ name: 'LSquare', pattern: /\[/ });
export const RSquare = createToken({ name: 'RSquare', pattern: /\]/ });
export const LParen = createToken({ name: 'LParen', pattern: /\(/ });
export const RParen = createToken({ name: 'RParen', pattern: /\)/ });
export const Colon = createToken({ name: 'Colon', pattern: /:/ });
export const Comma = createToken({ name: 'Comma', pattern: /,/ });
export const SemiColon = createToken({ name: 'SemiColon', pattern: /;/ });

// Literals
export const StringLiteral = createToken({ name: 'StringLiteral', pattern: /"(?:[^"\\]|\\.)*"/ });
export const NumberLiteral = createToken({ name: 'NumberLiteral', pattern: /-?\d+(?:\.\d+)?/ });

// The order of tokens is important! 
// Keywords and specific matchers must be before generic ones (like Identifier).
export const allTokens = [
  WhiteSpace,
  Comment,
  // Keywords
  Config,
  Collection,
  Fields,
  True,
  False,
  // Decorator
  Decorator,
  // Identifier
  Identifier,
  // Punctuation
  LCurly,
  RCurly,
  LSquare,
  RSquare,
  LParen,
  RParen,
  Colon,
  Comma,
  SemiColon,
  // Literals
  StringLiteral,
  NumberLiteral
];

export const RadiantLexer = new Lexer(allTokens);
