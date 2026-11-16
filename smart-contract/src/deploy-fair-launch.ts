// Deploys the Fair Launch SC (bonding-curve memecoins that list themselves on Dusa) and checks it
// with read-only calls.
//
//   cp .env.example .env          # PRIVATE_KEY of the deployer (becomes the Fair Launch admin)
//   npm run deploy:fair-launch    # buildnet; NETWORK=mainnet npm run deploy:fair-launch for mainnet
//
// It launches tokens from the RustCore Launchpad's own token template, so it needs the Launchpad
// of that network (LAUNCHPAD=<address>, default: the one the app uses). Dusa's addresses and bin
// steps come from the app's network config. Fees and the target come from .env (buildnet
// defaults below). The result is written to deployments/fair-launch-<network>.json (an existing
// file is never overwritten); copy the address into `fairLaunchAddress` in
// src/app/core/network/networks.ts.
import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { Account, Args, JsonRpcProvider, Mas, SmartContract } from '@massalabs/massa-web3';
import { getScByteCode } from './utils';
import { NETWORKS } from '../../src/app/core/network/networks';
import { FairConfig, readFairConfig, writeFairConfig } from '../../src/app/core/fairlaunch/records';

const network = process.env['NETWORK'] === 'mainnet' ? 'mainnet' : 'buildnet';
const mas = (name: string, fallback: string) => Mas.fromString(process.env[name] ?? fallback);
const net = NETWORKS[network];
const dusa = net.dusa;
if (!dusa) throw new Error(`Dusa is not configured for ${network}`);
const launchpad = process.env['LAUNCHPAD'] ?? net.launchpadAddress;
if (!launchpad) throw new Error(`No Launchpad on ${network}: set LAUNCHPAD=<address>`);

const config: FairConfig = {
  // Less the Launchpad's holder discount (30 % for Core Keepers on mainnet), asked at creation.
  creationFee: mas('FAIR_CREATION_FEE_MAS', network === 'mainnet' ? '50' : '1'),
  tradeFeeBps: Number(process.env['FAIR_TRADE_FEE_BPS'] ?? '100'),
  graduationFeeBps: Number(process.env['FAIR_GRADUATION_FEE_BPS'] ?? '200'),
  // Small on buildnet so a whole curve can be tried with test MAS (the contract's minimum is
  // 100), but at least 200: a 980 M-gas deferred call costs ~9.85 MAS and is booked only up to 5 %
  // of the MAS raised, so below ~197 MAS the curve never graduates by itself.
  targetMas: mas('FAIR_TARGET_MAS', network === 'mainnet' ? '100000' : '200'),
  deployDeposit: mas('FAIR_DEPLOY_DEPOSIT_MAS', '0.1'),
  launchpad,
  dusaRouter: dusa.router,
  dusaFactory: dusa.factory,
  wmas: dusa.wmas,
  binSteps: [...dusa.binSteps].reverse(), // widest bins first: the steadiest new pools
  // 0 turns the self-graduation (deferred call) off; anyone can still graduate by hand.
  // graduate used 872.6 M gas on buildnet (2026-11-16); a deferred call takes just under 1 B.
  // 980 M costs ~9.85 MAS to book.
  autoGraduateGas: BigInt(process.env['FAIR_AUTO_GRADUATE_GAS'] ?? '980000000'),
  paused: false,
  // The least time a curve trades before it may sell out and move to Dusa (until then it keeps
  // its last unit): no instant sell-out by one buyer. Short on buildnet, for the e2e.
  minCurveMs:
    BigInt(process.env['FAIR_MIN_CURVE_MINUTES'] ?? (network === 'mainnet' ? '1440' : '10')) *
    60_000n,
};

const file = `deployments/fair-launch-${network}.json`;
if (existsSync(file)) throw new Error(`${file} exists: move it to deployments/history/ first.`);

const account = await Account.fromEnv();
const provider =
  network === 'mainnet' ? JsonRpcProvider.mainnet(account) : JsonRpcProvider.buildnet(account);
const admin = account.address.toString();
console.log(`Network ${network}, admin ${admin}, Launchpad ${launchpad}`);
console.log(`Balance before: ${Mas.toString(await provider.balance(false))} MAS`);

const code = getScByteCode('build', 'fair-launch.wasm');
console.log(`Deploying fair-launch.wasm (${code.length} bytes)…`);
const contract = await SmartContract.deploy(provider, code, writeFairConfig(new Args(), config), {
  coins: Mas.fromString('0.1'), // constructor storage (config, admin)
  waitFinalExecution: true,
});
console.log(`Fair Launch deployed at ${contract.address}`);

// Read back what is on-chain.
const onChain = readFairConfig(new Args((await contract.read('config')).value));
if (onChain.targetMas !== config.targetMas || onChain.launchpad !== launchpad)
  throw new Error('The config on-chain differs from the one sent');
const adminOnChain = new TextDecoder().decode((await contract.read('admin')).value);
if (adminOnChain !== admin) throw new Error(`Admin on-chain is ${adminOnChain}`);
const version = new TextDecoder().decode((await contract.read('version')).value);
console.log(`Version ${version}, admin ✓, config ✓`);

mkdirSync('deployments', { recursive: true });
writeFileSync(
  file,
  JSON.stringify(
    {
      network,
      address: contract.address,
      version,
      admin,
      deployedAt: new Date().toISOString(),
      bytes: code.length,
      config: {
        ...config,
        creationFee: Mas.toString(config.creationFee),
        targetMas: Mas.toString(config.targetMas),
        deployDeposit: Mas.toString(config.deployDeposit),
        autoGraduateGas: config.autoGraduateGas.toString(),
        minCurveMs: undefined,
        minCurveMinutes: Number(config.minCurveMs / 60_000n),
      },
    },
    null,
    2,
  ) + '\n',
);
console.log(`Saved ${file}. Now set fairLaunchAddress in src/app/core/network/networks.ts.`);
