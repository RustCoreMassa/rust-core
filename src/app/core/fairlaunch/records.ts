import { Args, ArrayTypes } from '@massalabs/massa-web3';
import { stripHidden } from '../utils/hidden-chars';
import { ProjectInfo, readInfo } from '../launchpad/records';

/**
 * TypeScript mirror of the Fair Launch SC records (smart-contract/assembly/lib/fairlaunch/
 * records.ts). Field order and types must match the contract exactly: Args has no field names.
 */

export const STATE_TRADING = 0;
/** Sold out, waiting for the Dusa pool (anyone may call `graduate`). */
export const STATE_COMPLETE = 1;
/** Trading on Dusa; the pool's liquidity is locked in the Fair Launch contract for good. */
export const STATE_GRADUATED = 2;

export interface FairConfig {
  creationFee: bigint;
  tradeFeeBps: number;
  graduationFeeBps: number;
  /** nanoMAS the curve raises when it sells out. */
  targetMas: bigint;
  deployDeposit: bigint;
  launchpad: string;
  dusaRouter: string;
  dusaFactory: string;
  wmas: string;
  binSteps: number[];
  /** Gas of the deferred call that graduates a sold-out launch by itself; 0 = off. */
  autoGraduateGas: bigint;
  paused: boolean;
}

export interface Launch {
  id: bigint;
  token: string;
  creator: string;
  createdAt: number;
  name: string;
  symbol: string;
  templateVersion: number;
  templateHash: Uint8Array;
  virtualMas: bigint;
  targetMas: bigint;
  tradeFeeBps: number;
  graduationFeeBps: number;
  /** Tokens sold by the curve (smallest units, 9 decimals) and the nanoMAS it holds for them. */
  sold: bigint;
  masIn: bigint;
  state: number;
  autoFee: bigint;
  pair: string;
  binStep: number;
  graduatedAt: number;
  hidden: boolean;
  info: ProjectInfo;
}

export function readFairConfig(args: Args): FairConfig {
  return {
    creationFee: args.nextU64(),
    tradeFeeBps: Number(args.nextU16()),
    graduationFeeBps: Number(args.nextU16()),
    targetMas: args.nextU64(),
    deployDeposit: args.nextU64(),
    launchpad: args.nextString(),
    dusaRouter: args.nextString(),
    dusaFactory: args.nextString(),
    wmas: args.nextString(),
    binSteps: (args.nextArray(ArrayTypes.U32) as bigint[]).map(Number),
    autoGraduateGas: args.nextU64(),
    paused: args.nextBool(),
  };
}

export function writeFairConfig(args: Args, c: FairConfig): Args {
  return args
    .addU64(c.creationFee)
    .addU16(BigInt(c.tradeFeeBps))
    .addU16(BigInt(c.graduationFeeBps))
    .addU64(c.targetMas)
    .addU64(c.deployDeposit)
    .addString(c.launchpad)
    .addString(c.dusaRouter)
    .addString(c.dusaFactory)
    .addString(c.wmas)
    .addArray(c.binSteps.map(BigInt), ArrayTypes.U32)
    .addU64(c.autoGraduateGas)
    .addBool(c.paused);
}

export function readLaunch(args: Args): Launch {
  return {
    id: args.nextU64(),
    token: args.nextString(),
    creator: args.nextString(),
    createdAt: Number(args.nextU64()),
    name: stripHidden(args.nextString()),
    symbol: stripHidden(args.nextString()),
    templateVersion: Number(args.nextU32()),
    templateHash: args.nextUint8Array(),
    virtualMas: args.nextU64(),
    targetMas: args.nextU64(),
    tradeFeeBps: Number(args.nextU16()),
    graduationFeeBps: Number(args.nextU16()),
    sold: args.nextU64(),
    masIn: args.nextU64(),
    state: Number(args.nextU8()),
    autoFee: args.nextU64(),
    pair: args.nextString(),
    binStep: Number(args.nextU32()),
    graduatedAt: Number(args.nextU64()),
    hidden: args.nextBool(),
    info: readInfo(args),
  };
}

/** getLaunches: a length-prefixed run of records (byte length, then the records). */
export function readLaunchList(bytes: Uint8Array): Launch[] {
  const array = new Args(new Args(bytes).nextUint8Array());
  const out: Launch[] = [];
  while (array.getOffset() < array.serialize().length) out.push(readLaunch(array));
  return out;
}
