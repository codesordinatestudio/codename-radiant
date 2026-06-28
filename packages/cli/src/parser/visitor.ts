import { parserInstance } from './parser';
import { IToken } from 'chevrotain';

const BaseRadiantVisitor = parserInstance.getBaseCstVisitorConstructor();

export class RadiantVisitor extends BaseRadiantVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  radiantFile(ctx: any) {
    const blocks: any[] = [];
    if (ctx.configBlock) {
      blocks.push(...ctx.configBlock.map((b: any) => this.visit(b)));
    }

    if (ctx.collectionBlock) {
      blocks.push(...ctx.collectionBlock.map((b: any) => this.visit(b)));
    }
    return { type: 'RadiantFile', blocks };
  }

  configBlock(ctx: any) {
    return {
      type: 'config',
      token: ctx.Config[0],
      body: this.visit(ctx.objectBody[0])
    };
  }



  collectionBlock(ctx: any) {
    return {
      type: 'collection',
      name: ctx.Identifier[0].image,
      nameToken: ctx.Identifier[0],
      body: this.visit(ctx.objectBody[0])
    };
  }

  objectBody(ctx: any) {
    const properties: any[] = [];
    if (ctx.property) {
      ctx.property.forEach((p: any) => {
        properties.push(this.visit(p));
      });
    }
    return properties;
  }

  propertyName(ctx: any) {
    if (ctx.Identifier) return ctx.Identifier[0];
    if (ctx.Config) return ctx.Config[0];

    if (ctx.Collection) return ctx.Collection[0];
    if (ctx.Fields) return ctx.Fields[0];
    return null;
  }

  property(ctx: any) {
    const nameToken = this.visit(ctx.propertyName[0]);
    const name = nameToken.image;
    const value = this.visit(ctx.value[0]);
    const isArray = ctx.LSquare !== undefined;
    const decorators = ctx.decorator ? ctx.decorator.map((d: any) => this.visit(d)) : [];
    return {
      type: 'property',
      name,
      nameToken,
      value,
      isArray,
      decorators
    };
  }

  value(ctx: any) {
    if (ctx.StringLiteral) {
      const text = ctx.StringLiteral[0].image;
      return text.substring(1, text.length - 1); // remove quotes
    }
    if (ctx.NumberLiteral) {
      return Number(ctx.NumberLiteral[0].image);
    }
    if (ctx.True) return true;
    if (ctx.False) return false;
    
    if (ctx.functionOrIdentifier) {
      return this.visit(ctx.functionOrIdentifier[0]);
    }
    if (ctx.arrayLiteral) {
      return this.visit(ctx.arrayLiteral[0]);
    }
    if (ctx.objectLiteral) {
      return this.visit(ctx.objectLiteral[0]);
    }
    return null;
  }

  functionOrIdentifier(ctx: any) {
    const token = ctx.Identifier[0];
    const name = token.image;
    let args: any[] = [];
    if (ctx.LParen) {
      if (ctx.value) {
        args = ctx.value.map((v: any) => this.visit(v));
      }
      return { type: 'function', name, args, token };
    }
    return { type: 'identifier', name, token };
  }

  arrayLiteral(ctx: any) {
    if (!ctx.value) return { type: 'array', elements: [] };
    const elements = ctx.value.map((v: any) => this.visit(v));
    return { type: 'array', elements };
  }

  objectLiteral(ctx: any) {
    const props = this.visit(ctx.objectBody[0]);
    return { type: 'object', properties: props };
  }

  decorator(ctx: any) {
    const name = ctx.Decorator[0].image.substring(1); // remove @
    let args: any[] = [];
    if (ctx.value) {
      args = ctx.value.map((v: any) => this.visit(v));
    }
    return { type: 'decorator', name, args };
  }
}

export const visitorInstance = new RadiantVisitor();
