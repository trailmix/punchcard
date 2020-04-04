import { AnyShape, BinaryShape, bool, integer, NeverShape, NothingShape, ShapeVisitor, UnknownShape } from '@punchcard/shape';
import { ArrayShape, BoolShape, DynamicShape, IntegerShape, MapShape, NumberShape, Pointer, RecordShape, SetShape, Shape, StringShape, TimestampShape } from '@punchcard/shape';
import { string, Trait } from '@punchcard/shape';
import { FunctionArgs, FunctionShape } from '@punchcard/shape/lib/function';
import { VExpression } from './expression';

const type = Symbol.for('GraphQL.Type');
const expr = Symbol.for('GraphQL.Expression');

export class VObject<T extends Shape = Shape> {
  public static readonly Type = type;
  public static readonly Expr = expr;

  public static typeOf<T extends VObject>(t: T): T[typeof type] {
    return t[type];
  }

  public static exprOf<T extends VObject>(t: T): T[typeof expr] {
    return t[expr];
  }

  public readonly [type]: T;
  public readonly [expr]: VExpression;
  constructor(_type: T, _expr: VExpression) {
    this[type] = _type;
    this[expr] = _expr;
  }
}

export namespace VObject {
  export type TypeOf<T extends VObject> = T[typeof type];

  export function isObject(a: any): a is VObject {
    return a[expr] !== undefined;
  }

  // export type ShapeOf<T extends VObject> = T extends VObject<infer I> ? I : never;

  export type Of<T extends Shape> =
    T extends RecordShape<infer M> ? VRecord<{
      [m in keyof M]: Of<Pointer.Resolve<M[m]>>;
    }> & {
      [m in keyof M]: Of<Pointer.Resolve<M[m]>>;
    } :
    T extends ArrayShape<infer I> ? VList<VObject.Of<I>> :
    T extends MapShape<any> ? never : // maps are not supported in GraphQL
    T extends BoolShape ? VBool :
    T extends DynamicShape<any> ? VAny :
    T extends IntegerShape ? VInteger :
    T extends NumberShape ? VFloat :
    T extends StringShape ? VString :
    T extends TimestampShape ? VTimestamp :

    VObject<T>
    ;

  /**
   * Object that is "like" a VObject for some Shape.
   *
   * Like meaning that is either an expression, or a collection
   * of expressions that share the structure of the target type.
   */
  export type Like<T extends Shape> = VObject.Of<T> | (
    T extends RecordShape<infer M> ? {
      [m in keyof M]: Like<Pointer.Resolve<M[m]>>;
    } :
    T extends ArrayShape<infer I> ? Like<I>[] :
    T extends SetShape<infer I> ? Like<I>[] :
    T extends MapShape<infer I> ? {
      [key: string]: Like<I>;
    } :
    VObject.Of<T>
  );
}

export const IDTrait: {
  [Trait.Data]: {
    graphqlType: 'ID'
  }
} = {
  [Trait.Data]: {
    graphqlType: 'ID'
  }
};

export const ID = string.apply(IDTrait);

export class VAny extends VObject<AnyShape> {}
export class VUnknown extends VObject<UnknownShape> {}
export class VInteger extends VObject<IntegerShape> {}
export class VFloat extends VObject<NumberShape> {}
export class VNothing extends VObject<NothingShape> {}
export class VNever extends VObject<NeverShape> {}
export class VBinary extends VObject<BinaryShape> {}

export class VBool extends VObject<BoolShape> {
  public static not(a: VBool): VBool {
    return new VBool(bool, VObject.exprOf(a).prepend('!'));
  }
}

export class VString extends VObject<StringShape> {
  public toUpperCase(): VString {
    return new VString(VObject.typeOf(this), VObject.exprOf(this).dot('toUpperCase()'));
  }

  public isNotEmpty(): VBool {
    return VBool.not(this.isEmpty());
  }

  public isEmpty(): VBool {
    return new VBool(bool, VObject.exprOf(this).dot('isEmpty()'));
  }

  public size(): VInteger {
    return new VInteger(integer, VObject.exprOf(this).dot('size()'));
  }
}

export class VTimestamp extends VObject<TimestampShape> {}

export class VList<T extends VObject = VObject> extends VObject<ArrayShape<VObject.TypeOf<T>>> {
  constructor(shape: ArrayShape<VObject.TypeOf<T>>, expression: VExpression) {
    super(shape, expression);
  }
}


export class VSet<T extends VObject = VObject> extends VObject<SetShape<VObject.TypeOf<T>>> {
  constructor(shape: SetShape<VObject.TypeOf<T>>, expression: VExpression) {
    super(shape, expression);
  }
}

export class VRecord<M extends VRecord.Members = {}> extends VObject<RecordShape<{
  [m in keyof M]: M[m][typeof type];
}>> {}
export namespace VRecord {
  export type GetMembers<R extends VRecord> = R extends VRecord<infer M> ? M : any;
  export interface Members {
    [m: string]: VObject;
  }
  export type Class<T extends VRecord = any> = (new(members: VRecord.GetMembers<T>) => T);
}


export class Visitor implements ShapeVisitor<VObject, VExpression> {
  public static defaultInstance = new Visitor();

  public functionShape(shape: FunctionShape<FunctionArgs, Shape>): VObject<Shape> {
    throw new Error("Method not implemented.");
  }
  public neverShape(shape: NeverShape, context: VExpression): VObject<Shape> {
    throw new Error("Method not implemented.");
  }
  public arrayShape(shape: ArrayShape<any>, expr: VExpression): VList {
    return new VList(shape, expr);
  }
  public binaryShape(shape: BinaryShape, expr: VExpression): VBinary {
    return new VBinary(shape, expr);
  }
  public boolShape(shape: BoolShape, expr: VExpression): VBool {
    return new VBool(shape, expr);
  }
  public recordShape(shape: RecordShape<any>, expr: VExpression): VRecord {
    return new VRecord(shape, expr);
  }
  public dynamicShape(shape: DynamicShape<any>, expr: VExpression): VAny | VUnknown {
    if (shape.Tag === 'any') {
      return new VAny(shape as AnyShape, expr);
    } else {
      return new VUnknown(shape as UnknownShape, expr);
    }
  }
  public integerShape(shape: IntegerShape, expr: VExpression): VInteger {
    return new VInteger(shape, expr);
  }
  public mapShape(shape: MapShape<Shape>, expr: VExpression): never {
    throw new Error(`map is not supported by GraphQL`);
  }
  public nothingShape(shape: NothingShape, expr: VExpression): VNothing {
    throw new VNothing(shape, expr);
  }
  public numberShape(shape: NumberShape, expr: VExpression): VFloat {
    // tslint:disable-next-line: no-construct
    return new VFloat(shape, expr);
  }
  public setShape(shape: SetShape<Shape>, expr: VExpression): VSet<VObject> {
    return new VSet(shape, expr);
  }
  public stringShape(shape: StringShape, expr: VExpression): VString {
    // tslint:disable-next-line: no-construct
    return new VString(shape, expr);
  }
  public timestampShape(shape: TimestampShape, expr: VExpression): VTimestamp {
    return new VTimestamp(shape, expr);
  }
}