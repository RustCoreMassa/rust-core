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
  creationFee: mas('FAIR_CREATION_FEE_MAS', '1'),
  tradeFeeBps: Number(process.env['FAIR_TRADE_FEE_BPS'] ?? '100'),
  graduationFeeBps: Number(process.env['FAIR_GRADUATION_FEE_BPS'] ?? '200'),
  // Small on buildnet so a whole curve can be tried with test MAS; the contract's minimum is 100.
  targetMas: mas('FAIR_TARGET_MAS', network === 'mainnet' ? '50000' : '100'),
  deployDeposit: mas('FAIR_DEPLOY_DEPOSIT_MAS', '0.1'),
  launchpad,
  dusaRouter: dusa.router,
  dusaFactory: dusa.factory,
  wmas: dusa.wmas,
  binSteps: [...dusa.binSteps].reverse(), // widest bins first: the steadiest new pools
  // 0 turns the self-graduation (deferred call) off; anyone can still graduate by hand.
  autoGraduateGas: BigInt(process.env['FAIR_AUTO_GRADUATE_GAS'] ?? '900000000'),
  paused: false,
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
      },
    },
    null,
    2,
  ) + '\n',
);
console.log(`Saved ${file}. Now set fairLaunchAddress in src/app/core/network/networks.ts.`);
