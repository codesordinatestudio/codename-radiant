import { CstParser } from 'chevrotain';
import * as L from './lexer';

export class RadiantParser extends CstParser {
  constructor() {
    super(L.allTokens, {
      recoveryEnabled: true,
      maxLookahead: 2,
      nodeLocationTracking: "onlyOffsets"
    });
    this.performSelfAnalysis();
  }

  public radiantFile = this.RULE('radiantFile', () => {
    this.MANY(() => {
      this.OR([
        { ALT: () => this.SUBRULE(this.configBlock) },
        { ALT: () => this.SUBRULE(this.collectionBlock) },
        { ALT: () => this.SUBRULE(this.globalBlock) }
      ]);
    });
  });

  public configBlock = this.RULE('configBlock', () => {
    this.CONSUME(L.Config);
    this.CONSUME(L.LCurly);
    this.SUBRULE(this.objectBody);
    this.CONSUME(L.RCurly);
  });



  public collectionBlock = this.RULE('collectionBlock', () => {
    this.CONSUME(L.Collection);
    this.CONSUME(L.Identifier);
    this.CONSUME(L.LCurly);
    this.SUBRULE(this.objectBody);
    this.CONSUME(L.RCurly);
  });

  public globalBlock = this.RULE('globalBlock', () => {
    this.CONSUME(L.Global);
    this.CONSUME(L.Identifier);
    this.CONSUME(L.LCurly);
    this.SUBRULE(this.objectBody);
    this.CONSUME(L.RCurly);
  });

  public objectBody = this.RULE('objectBody', () => {
    this.MANY(() => {
      this.SUBRULE(this.property);
    });
  });

  public propertyName = this.RULE('propertyName', () => {
    this.OR([
      { ALT: () => this.CONSUME(L.Identifier) },
      { ALT: () => this.CONSUME(L.Config) },
      { ALT: () => this.CONSUME(L.Collection) },
      { ALT: () => this.CONSUME(L.Global) },
      { ALT: () => this.CONSUME(L.Fields) }
    ]);
  });

  public property = this.RULE('property', () => {
    this.SUBRULE(this.propertyName);
    this.CONSUME(L.Colon);
    this.SUBRULE(this.value);
    
    // Optional array suffix for types like link("posts")[]
    this.OPTION(() => {
      this.CONSUME(L.LSquare);
      this.CONSUME(L.RSquare);
    });

    // Decorators like @unique or @default("user")
    this.MANY(() => {
      this.SUBRULE(this.decorator);
    });

    // Optional semicolon or comma
    this.OPTION2(() => {
      this.OR([
        { ALT: () => this.CONSUME(L.SemiColon) },
        { ALT: () => this.CONSUME(L.Comma) }
      ]);
    });
  });

  public value = this.RULE('value', () => {
    this.OR([
      { ALT: () => this.CONSUME(L.StringLiteral) },
      { ALT: () => this.CONSUME(L.NumberLiteral) },
      { ALT: () => this.CONSUME(L.True) },
      { ALT: () => this.CONSUME(L.False) },
      { ALT: () => this.SUBRULE(this.functionOrIdentifier) },
      { ALT: () => this.SUBRULE(this.arrayLiteral) },
      { ALT: () => this.SUBRULE(this.objectLiteral) }
    ]);
  });

  public functionOrIdentifier = this.RULE('functionOrIdentifier', () => {
    this.CONSUME(L.Identifier);
    this.OPTION(() => {
      this.CONSUME(L.LParen);
      this.OPTION2(() => {
        this.SUBRULE(this.value);
        this.MANY(() => {
          this.CONSUME(L.Comma);
          this.SUBRULE2(this.value);
        });
      });
      this.CONSUME(L.RParen);
    });
  });

  public arrayLiteral = this.RULE('arrayLiteral', () => {
    this.CONSUME(L.LSquare);
    this.OPTION(() => {
      this.SUBRULE(this.value);
      this.MANY(() => {
        this.CONSUME(L.Comma);
        this.SUBRULE2(this.value);
      });
    });
    this.CONSUME(L.RSquare);
  });

  public objectLiteral = this.RULE('objectLiteral', () => {
    this.CONSUME(L.LCurly);
    this.SUBRULE(this.objectBody);
    this.CONSUME(L.RCurly);
  });

  public decorator = this.RULE('decorator', () => {
    this.CONSUME(L.Decorator);
    this.OPTION(() => {
      this.CONSUME(L.LParen);
      this.SUBRULE(this.value);
      this.MANY(() => {
        this.CONSUME(L.Comma);
        this.SUBRULE2(this.value);
      });
      this.CONSUME(L.RParen);
    });
  });
}

// Reuse the same parser instance.
export const parserInstance = new RadiantParser();
