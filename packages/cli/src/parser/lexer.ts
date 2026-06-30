import { createToken, Lexer, type TokenType } from "chevrotain";

// Comments & Whitespace
export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /[ \t\n\r]+/,
  group: "whitespace",
});

export const Comment = createToken({
  name: "Comment",
  pattern: /\/\/[^\n\r]*/,
  group: "comments",
});

// Identifier
export const Identifier = createToken({ name: "Identifier", pattern: /[a-zA-Z_][a-zA-Z0-9_]*/ });

// Keywords
export const Config = createToken({ name: "Config", pattern: /config/, longer_alt: Identifier });
export const Collection = createToken({ name: "Collection", pattern: /collection/, longer_alt: Identifier });
export const Global = createToken({ name: "Global", pattern: /globals?/, longer_alt: Identifier });
export const Fields = createToken({ name: "Fields", pattern: /fields/, longer_alt: Identifier });

export const True = createToken({ name: "True", pattern: /true/, longer_alt: Identifier });
export const False = createToken({ name: "False", pattern: /false/, longer_alt: Identifier });

// Decorator token: e.g. @unique
export const Decorator = createToken({ name: "Decorator", pattern: /@[a-zA-Z_][a-zA-Z0-9_]*/ });

// Punctuation
export const LCurly = createToken({ name: "LCurly", pattern: /\{/ });
export const RCurly = createToken({ name: "RCurly", pattern: /\}/ });
export const LSquare = createToken({ name: "LSquare", pattern: /\[/ });
export const RSquare = createToken({ name: "RSquare", pattern: /\]/ });
export const LParen = createToken({ name: "LParen", pattern: /\(/ });
export const RParen = createToken({ name: "RParen", pattern: /\)/ });
export const Colon = createToken({ name: "Colon", pattern: /:/ });
export const Comma = createToken({ name: "Comma", pattern: /,/ });
export const SemiColon = createToken({ name: "SemiColon", pattern: /;/ });

// Literals
export const StringLiteral = createToken({ name: "StringLiteral", pattern: /"(?:[^"\\]|\\.)*"/ });
export const NumberLiteral = createToken({ name: "NumberLiteral", pattern: /-?\d+(?:\.\d+)?/ });

// The order of tokens is important!
// Keywords and specific matchers must be before generic ones (like Identifier).
export const allTokens = [
  WhiteSpace,
  Comment,
  // Keywords
  Config,
  Collection,
  Global,
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
  NumberLiteral,
];

export const RadiantLexer = new Lexer(allTokens);
