import { FairConfig } from '../../core/fairlaunch/records';
import { fairConfigFromForm, fairFormOf } from './fair-launch-forms';

const MAS = 1_000_000_000n;
const BASE: FairConfig = {
  creationFee: 50n * MAS,
  tradeFeeBps: 100,
  graduationFeeBps: 200,
  targetMas: 100_000n * MAS,
  deployDeposit: MAS / 10n,
  launchpad: 'AS1launchpad',
  dusaRouter: 'AS1router',
  dusaFactory: 'AS1factory',
  wmas: 'AS1wmas',
  binSteps: [100, 50, 25, 20],
  autoGraduateGas: 980_000_000n,
  paused: true,
  minCurveMs: 24n * 3_600_000n,
};

describe('Fair Launch admin form', () => {
  it('shows the config and gives the same config back', () => {
    const form = fairFormOf(BASE);
    expect(form).toEqual({
      creationFee: '50',
      tradeFee: '1',
      graduationFee: '2',
      target: '100000',
      deposit: '0.1',
      binSteps: '100, 50, 25, 20',
      autoGraduateGas: '980000000',
      minCurveMinutes: '1440',
    });
    expect(fairConfigFromForm(BASE, form)).toEqual({ config: BASE });
  });

  it('keeps the addresses and the pause as they are', () => {
    const result = fairConfigFromForm(BASE, { ...fairFormOf(BASE), target: '250000' });
    expect('config' in result && result.config.targetMas).toBe(250_000n * MAS);
    expect('config' in result && result.config.paused).toBe(true);
    expect('config' in result && result.config.wmas).toBe('AS1wmas');
  });

  it('refuses what the contract would', () => {
    const result = fairConfigFromForm(BASE, {
      creationFee: 'x',
      tradeFee: '2.5',
      graduationFee: '6',
      target: '99',
      deposit: '11',
      binSteps: '20, 20',
      autoGraduateGas: '1000000000',
      minCurveMinutes: '50000',
    });
    expect('errors' in result && Object.keys(result.errors).sort()).toEqual([
      'autoGraduateGas',
      'binSteps',
      'creationFee',
      'deposit',
      'graduationFee',
      'minCurveMinutes',
      'target',
      'tradeFee',
    ]);
  });

  it('accepts no auto-graduation and no minimum time', () => {
    const result = fairConfigFromForm(BASE, {
      ...fairFormOf(BASE),
      autoGraduateGas: '0',
      minCurveMinutes: '0',
    });
    expect('config' in result && result.config.autoGraduateGas).toBe(0n);
    expect('config' in result && result.config.minCurveMs).toBe(0n);
  });
});
