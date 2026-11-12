// Records of the Fair Launch contract. Field order is the encoding: the app's mirror
// (src/app/core/fairlaunch/records.ts) must read them in the same order.
import { Args, Result, Serializable } from '@massalabs/as-types';
import { ProjectInfo } from '../launchpad/records';

export const STATE_TRADING: u8 = 0;
/** The curve sold out; the pool is not on Dusa yet (anyone may call `graduate`). */
export const STATE_COMPLETE: u8 = 1;
/** On Dusa: the pool holds the last tokens and the raised MAS, locked for good. */
export const STATE_GRADUATED: u8 = 2;

/** Set by the admin. Amounts in nanoMAS. A launch keeps the values in force when created. */
export class FairConfig implements Serializable {
  constructor(
    /** Paid to create a launch (on top of the storage it uses). */
    public creationFee: u64 = 0,
    /** On every buy and sell, in basis points (cap: MAX_TRADE_FEE_BPS). */
    public tradeFeeBps: u16 = 0,
    /** Taken from the raised MAS at graduation, in basis points (cap: MAX_GRADUATION_FEE_BPS). */
    public graduationFeeBps: u16 = 0,
    /** MAS the curve raises when it sells out. */
    public targetMas: u64 = 0,
    /** MAS given to each new token contract for its own storage. */
    public deployDeposit: u64 = 0,
    /** The RustCore Launchpad: its token template is the one fair launches deploy. */
    public launchpad: string = '',
    /** Dusa's router, factory and WMAS on this network. */
    public dusaRouter: string = '',
    public dusaFactory: string = '',
    public wmas: string = '',
    /** Dusa bin steps to graduate into, in order of preference (the first one free wins). */
    public binSteps: u32[] = [],
    /** Gas of the deferred call that graduates a sold-out launch by itself; 0 = off. */
    public autoGraduateGas: u64 = 0,
    /** Pauses new launches and buys. Sells and graduation keep working. */
    public paused: bool = false,
  ) {}

  serialize(): StaticArray<u8> {
    return new Args()
      .add(this.creationFee)
      .add(this.tradeFeeBps)
      .add(this.graduationFeeBps)
      .add(this.targetMas)
      .add(this.deployDeposit)
      .add(this.launchpad)
      .add(this.dusaRouter)
      .add(this.dusaFactory)
      .add(this.wmas)
      .add(this.binSteps)
      .add(this.autoGraduateGas)
      .add(this.paused)
      .serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
    this.creationFee = args.nextU64().expect('creationFee is missing or invalid');
    this.tradeFeeBps = args.nextU16().expect('tradeFeeBps is missing or invalid');
    this.graduationFeeBps = args.nextU16().expect('graduationFeeBps is missing or invalid');
    this.targetMas = args.nextU64().expect('targetMas is missing or invalid');
    this.deployDeposit = args.nextU64().expect('deployDeposit is missing or invalid');
    this.launchpad = args.nextString().expect('launchpad is missing or invalid');
    this.dusaRouter = args.nextString().expect('dusaRouter is missing or invalid');
    this.dusaFactory = args.nextString().expect('dusaFactory is missing or invalid');
    this.wmas = args.nextString().expect('wmas is missing or invalid');
    this.binSteps = args.nextFixedSizeArray<u32>().expect('binSteps is missing or invalid');
    this.autoGraduateGas = args.nextU64().expect('autoGraduateGas is missing or invalid');
    this.paused = args.nextBool().expect('paused is missing or invalid');
    return new Result(args.offset);
  }
}

/** One fair launch: its token, its curve and, once graduated, its Dusa pool. */
export class Launch implements Serializable {
  constructor(
    public id: u64 = 0,
    public token: string = '',
    public creator: string = '',
    public createdAt: u64 = 0,
    public name: string = '',
    public symbol: string = '',
    /** The Launchpad's token template the token was deployed from. */
    public templateVersion: u32 = 0,
    public templateHash: StaticArray<u8> = [],
    /** Fixed when created. */
    public virtualMas: u64 = 0,
    public targetMas: u64 = 0,
    public tradeFeeBps: u16 = 0,
    public graduationFeeBps: u16 = 0,
    /** Curve state: tokens sold (smallest units) and the MAS it holds for them. */
    public sold: u64 = 0,
    public masIn: u64 = 0,
    public state: u8 = STATE_TRADING,
    /** Paid out of the raised MAS when it sold out: the deferred call booking, if any. */
    public autoFee: u64 = 0,
    /** Graduation: the Dusa pair, its bin step, and when. */
    public pair: string = '',
    public binStep: u32 = 0,
    public graduatedAt: u64 = 0,
    public hidden: bool = false,
    public info: ProjectInfo = new ProjectInfo(),
  ) {}

  serialize(): StaticArray<u8> {
    return new Args()
      .add(this.id)
      .add(this.token)
      .add(this.creator)
      .add(this.createdAt)
      .add(this.name)
      .add(this.symbol)
      .add(this.templateVersion)
      .add(this.templateHash)
      .add(this.virtualMas)
      .add(this.targetMas)
      .add(this.tradeFeeBps)
      .add(this.graduationFeeBps)
      .add(this.sold)
      .add(this.masIn)
      .add(this.state)
      .add(this.autoFee)
      .add(this.pair)
      .add(this.binStep)
      .add(this.graduatedAt)
      .add(this.hidden)
      .add(this.info)
      .serialize();
  }

  deserialize(data: StaticArray<u8>, offset: i32): Result<i32> {
    const args = new Args(data, offset);
    this.id = args.nextU64().expect('id is missing or invalid');
    this.token = args.nextString().expect('token is missing or invalid');
    this.creator = args.nextString().expect('creator is missing or invalid');
    this.createdAt = args.nextU64().expect('createdAt is missing or invalid');
    this.name = args.nextString().expect('name is missing or invalid');
    this.symbol = args.nextString().expect('symbol is missing or invalid');
    this.templateVersion = args.nextU32().expect('templateVersion is missing or invalid');
    this.templateHash = args.nextBytes().expect('templateHash is missing or invalid');
    this.virtualMas = args.nextU64().expect('virtualMas is missing or invalid');
    this.targetMas = args.nextU64().expect('targetMas is missing or invalid');
    this.tradeFeeBps = args.nextU16().expect('tradeFeeBps is missing or invalid');
    this.graduationFeeBps = args.nextU16().expect('graduationFeeBps is missing or invalid');
    this.sold = args.nextU64().expect('sold is missing or invalid');
    this.masIn = args.nextU64().expect('masIn is missing or invalid');
    this.state = args.nextU8().expect('state is missing or invalid');
    this.autoFee = args.nextU64().expect('autoFee is missing or invalid');
    this.pair = args.nextString().expect('pair is missing or invalid');
    this.binStep = args.nextU32().expect('binStep is missing or invalid');
    this.graduatedAt = args.nextU64().expect('graduatedAt is missing or invalid');
    this.hidden = args.nextBool().expect('hidden is missing or invalid');
    this.info = args.nextSerializable<ProjectInfo>().expect('info is missing or invalid');
    return new Result(args.offset);
  }
}
