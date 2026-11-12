import { Args } from '@massalabs/massa-web3';
import {
  FairConfig,
  STATE_TRADING,
  readFairConfig,
  readLaunch,
  readLaunchList,
  writeFairConfig,
} from './records';
import { CURVE_TOKENS, quoteBuy } from './curve';

// Written by the contract's own code (smart-contract/assembly/__tests__/fair-launch.spec.ts,
// "Encoding for the app"): a launch with a 5 MAS dev buy, and the test config. If the app and
// the contract ever disagree on the encoding, these tests fail.
const CONTRACT_LAUNCH = new Uint8Array([
  1, 0, 0, 0, 0, 0, 0, 0, 53, 0, 0, 0, 65, 83, 50, 105, 122, 120, 50, 78, 106, 51, 57, 117, 109,
  107, 116, 80, 83, 112, 109, 86, 83, 86, 65, 54, 100, 120, 76, 54, 106, 72, 69, 77, 99, 88, 110,
  97, 90, 89, 70, 106, 69, 82, 107, 56, 111, 112, 72, 49, 115, 84, 54, 51, 118, 51, 0, 0, 0, 65, 85,
  49, 50, 66, 113, 90, 69, 81, 54, 115, 66, 121, 104, 82, 76, 121, 69, 117, 102, 48, 89, 98, 81,
  109, 99, 70, 50, 80, 115, 68, 100, 107, 78, 78, 71, 49, 97, 107, 66, 74, 117, 57, 88, 99, 106, 90,
  65, 49, 101, 56, 143, 220, 127, 207, 161, 1, 0, 0, 9, 0, 0, 0, 70, 97, 105, 114, 32, 67, 114, 97,
  98, 4, 0, 0, 0, 88, 67, 72, 75, 1, 0, 0, 0, 3, 0, 0, 0, 9, 9, 9, 85, 5, 55, 156, 77, 0, 0, 0, 0,
  16, 165, 212, 232, 0, 0, 0, 100, 0, 200, 0, 159, 55, 76, 191, 220, 0, 56, 0, 0, 242, 5, 42, 1, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 19, 0, 0, 0,
  84, 111, 32, 116, 104, 101, 32, 109, 111, 111, 110, 44, 32, 102, 97, 105, 114, 108, 121, 15, 0, 0,
  0, 105, 112, 102, 115, 58, 47, 47, 98, 97, 102, 121, 76, 111, 103, 111, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

const CONTRACT_CONFIG = new Uint8Array([
  0, 148, 53, 119, 0, 0, 0, 0, 100, 0, 200, 0, 0, 16, 165, 212, 232, 0, 0, 0, 0, 225, 245, 5, 0, 0,
  0, 0, 53, 0, 0, 0, 65, 83, 49, 50, 114, 70, 118, 65, 69, 111, 76, 97, 109, 101, 106, 51, 69, 77,
  52, 70, 117, 103, 72, 112, 88, 114, 115, 69, 121, 104, 68, 109, 112, 77, 107, 74, 80, 115, 85,
  121, 67, 105, 107, 72, 56, 65, 101, 71, 102, 80, 71, 84, 103, 52, 0, 0, 0, 65, 83, 49, 120, 101,
  100, 53, 113, 84, 70, 99, 115, 87, 82, 50, 67, 101, 55, 86, 76, 97, 65, 69, 72, 100, 101, 56, 98,
  74, 105, 84, 114, 88, 56, 74, 72, 77, 51, 53, 113, 107, 72, 106, 109, 110, 113, 72, 49, 71, 70,
  85, 56, 53, 0, 0, 0, 65, 83, 49, 50, 119, 51, 118, 99, 69, 89, 110, 56, 86, 66, 88, 49, 117, 116,
  119, 49, 102, 83, 109, 70, 78, 98, 89, 118, 57, 118, 77, 118, 121, 53, 110, 56, 116, 113, 67, 74,
  106, 111, 71, 122, 51, 118, 97, 81, 89, 69, 104, 102, 112, 53, 0, 0, 0, 65, 83, 49, 50, 70, 87,
  53, 82, 115, 53, 89, 78, 50, 122, 100, 112, 69, 110, 113, 119, 106, 52, 105, 72, 85, 85, 80, 116,
  57, 82, 52, 69, 113, 106, 113, 50, 113, 116, 112, 74, 70, 78, 75, 87, 51, 109, 110, 51, 51, 82,
  117, 76, 85, 8, 0, 0, 0, 20, 0, 0, 0, 50, 0, 0, 0, 0, 202, 154, 59, 0, 0, 0, 0, 0,
]);

const MAS = 1_000_000_000n;

describe('Fair Launch records', () => {
  it('reads a launch record written by the contract', () => {
    const launch = readLaunch(new Args(CONTRACT_LAUNCH));
    expect(launch.id).toBe(1n);
    expect(launch.symbol).toBe('XCHK');
    expect(launch.name).toBe('Fair Crab');
    expect(launch.creator).toBe('AU12BqZEQ6sByhRLyEuf0YbQmcF2PsDdkNNG1akBJu9XcjZA1e8');
    expect(launch.token.startsWith('AS')).toBe(true);
    expect(launch.templateVersion).toBe(1);
    expect(Array.from(launch.templateHash)).toEqual([9, 9, 9]);
    expect(launch.targetMas).toBe(1_000n * MAS);
    expect(launch.virtualMas).toBe((1_000n * MAS) / 3n);
    expect(launch.tradeFeeBps).toBe(100);
    expect(launch.graduationFeeBps).toBe(200);
    expect(launch.masIn).toBe(5n * MAS);
    // The app's curve mirror gives the same tokens as the contract did.
    expect(launch.sold).toBe(
      quoteBuy({ virtualMas: launch.virtualMas, masIn: 0n, sold: 0n }, 5n * MAS).tokens,
    );
    expect(launch.state).toBe(STATE_TRADING);
    expect(launch.pair).toBe('');
    expect(launch.hidden).toBe(false);
    expect(launch.info.description).toBe('To the moon, fairly');
    expect(launch.info.logoUrl).toBe('ipfs://bafyLogo');
  });

  it('reads the config written by the contract, and writes the same bytes', () => {
    const config = readFairConfig(new Args(CONTRACT_CONFIG));
    expect(config.creationFee).toBe(2n * MAS);
    expect(config.tradeFeeBps).toBe(100);
    expect(config.graduationFeeBps).toBe(200);
    expect(config.targetMas).toBe(1_000n * MAS);
    expect(config.binSteps).toEqual([20, 50]);
    expect(config.autoGraduateGas).toBe(1_000_000_000n);
    expect(config.paused).toBe(false);
    expect(Array.from(writeFairConfig(new Args(), config).serialize())).toEqual(
      Array.from(CONTRACT_CONFIG),
    );
  });

  it('reads a page of launches', () => {
    const page = new Args().addUint8Array(new Uint8Array([...CONTRACT_LAUNCH, ...CONTRACT_LAUNCH]));
    const list = readLaunchList(page.serialize());
    expect(list.length).toBe(2);
    expect(list[1].symbol).toBe('XCHK');
  });

  it('round-trips a config', () => {
    const config: FairConfig = {
      creationFee: 1n,
      tradeFeeBps: 50,
      graduationFeeBps: 0,
      targetMas: 100n * MAS,
      deployDeposit: 0n,
      launchpad: 'AS1a',
      dusaRouter: 'AS1b',
      dusaFactory: 'AS1c',
      wmas: 'AS1d',
      binSteps: [100],
      autoGraduateGas: 0n,
      paused: true,
    };
    expect(readFairConfig(new Args(writeFairConfig(new Args(), config).serialize()))).toEqual(
      config,
    );
  });

  it('counts the curve in whole tokens', () => {
    expect(CURVE_TOKENS).toBe(800_000_000n * MAS);
  });
});
