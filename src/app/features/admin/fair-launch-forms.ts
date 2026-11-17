import { FairConfig } from '../../core/fairlaunch/records';
import { priceNano } from '../create/collection-draft';
import { masText, percentToBps } from './admin-forms';

/** The Fair Launch contract's caps (fair-launch.ts): setConfig refuses anything beyond them. */
export const FAIR_MAX_TRADE_FEE_BPS = 200;
export const FAIR_MAX_GRADUATION_FEE_BPS = 500;
const MAS = 1_000_000_000n;
export const FAIR_MIN_TARGET = 100n * MAS;
export const FAIR_MAX_TARGET = 100_000_000n * MAS;
export const FAIR_MAX_DEPOSIT = 10n * MAS;
export const FAIR_MAX_BIN_STEPS = 8;
/** A deferred call takes just under 1 B gas: above this the booking always fails. */
export const FAIR_MAX_BOOKABLE_GAS = 999_000_000n;
export const FAIR_MAX_MIN_CURVE_MINUTES = 30 * 24 * 60;

/** The editable part of the Fair Launch config, as typed. */
export interface FairForm {
  creationFee: string;
  tradeFee: string;
  graduationFee: string;
  target: string;
  deposit: string;
  binSteps: string;
  autoGraduateGas: string;
  minCurveMinutes: string;
}

export type FairErrors = Partial<Record<keyof FairForm, string>>;

export function fairFormOf(c: FairConfig): FairForm {
  return {
    creationFee: masText(c.creationFee),
    tradeFee: String(c.tradeFeeBps / 100),
    graduationFee: String(c.graduationFeeBps / 100),
    target: masText(c.targetMas),
    deposit: masText(c.deployDeposit),
    binSteps: c.binSteps.join(', '),
    autoGraduateGas: c.autoGraduateGas.toString(),
    minCurveMinutes: String(Number(c.minCurveMs / 60_000n)),
  };
}

/**
 * The config the form describes: `base` with the edited fields (the addresses and `paused` stay
 * as they are), or the errors per field.
 */
export function fairConfigFromForm(
  base: FairConfig,
  form: FairForm,
): { config: FairConfig } | { errors: FairErrors } {
  const errors: FairErrors = {};
  const amount = (key: keyof FairForm, min: bigint, max: bigint | null, message: string) => {
    const value = form[key].trim() === '' ? null : priceNano(form[key]);
    if (value === null || value < min || (max !== null && value > max)) errors[key] = message;
    return value ?? 0n;
  };
  const creationFee = amount('creationFee', 0n, null, 'An amount in MAS, up to 9 decimals.');
  const target = amount('target', FAIR_MIN_TARGET, FAIR_MAX_TARGET, 'From 100 to 100 000 000 MAS.');
  const deposit = amount('deposit', 0n, FAIR_MAX_DEPOSIT, 'From 0 to 10 MAS.');
  const tradeFeeBps = percentToBps(form.tradeFee, FAIR_MAX_TRADE_FEE_BPS);
  if (tradeFeeBps === null) errors.tradeFee = 'From 0 to 2%, up to 2 decimals.';
  const graduationFeeBps = percentToBps(form.graduationFee, FAIR_MAX_GRADUATION_FEE_BPS);
  if (graduationFeeBps === null) errors.graduationFee = 'From 0 to 5%, up to 2 decimals.';

  const steps = form.binSteps
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((s) => (/^\d+$/.test(s) ? Number(s) : NaN));
  if (
    !steps.length ||
    steps.length > FAIR_MAX_BIN_STEPS ||
    steps.some((s) => !(s >= 1 && s <= 1000)) ||
    new Set(steps).size !== steps.length
  )
    errors.binSteps = '1 to 8 different bin steps from 1 to 1000, widest first (like 100, 50, 25).';

  const gasText = form.autoGraduateGas.trim().replace(/[ _,]/g, '');
  const gas = /^\d+$/.test(gasText) ? BigInt(gasText) : null;
  if (gas === null || gas > FAIR_MAX_BOOKABLE_GAS)
    errors.autoGraduateGas =
      '0 (graduation by hand) to 999 000 000: a deferred call takes no more.';

  const minutesText = form.minCurveMinutes.trim();
  const minutes = /^\d+$/.test(minutesText) ? Number(minutesText) : NaN;
  if (!(minutes >= 0 && minutes <= FAIR_MAX_MIN_CURVE_MINUTES))
    errors.minCurveMinutes = 'From 0 to 43 200 minutes (30 days).';

  if (Object.keys(errors).length) return { errors };
  return {
    config: {
      ...base,
      creationFee,
      tradeFeeBps: tradeFeeBps!,
      graduationFeeBps: graduationFeeBps!,
      targetMas: target,
      deployDeposit: deposit,
      binSteps: steps,
      autoGraduateGas: gas!,
      minCurveMs: BigInt(minutes) * 60_000n,
    },
  };
}
