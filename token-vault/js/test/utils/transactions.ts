import { Test } from 'tape';
import {
  airdrop,
  assertConfirmedTransaction,
  assertTransactionSummary,
  LOCALHOST,
  PayerTransactionHandler,
} from '@metaplex-foundation/amman';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { addressLabels } from '.';
import {
  activateVault,
  ActivateVaultAccounts,
  createExternalPriceAccount,
  InitVault,
  InitVaultInstructionAccounts,
  QUOTE_MINT,
} from '../../src/mpl-token-vault';
import { pdaForVault } from '../../src/common/helpers';

export async function init() {
  const [payer, payerPair] = addressLabels.genKeypair('payer');
  const [vaultAuthority, vaultAuthorityPair] = addressLabels.genKeypair('vaultAuthority');

  const connection = new Connection(LOCALHOST, 'confirmed');
  await airdrop(connection, payer, 2);

  const transactionHandler = new PayerTransactionHandler(connection, payerPair);
  return {
    transactionHandler,
    connection,
    payer,
    payerPair,
    vaultAuthority,
    vaultAuthorityPair,
  };
}

export async function setupInitVaultAccounts(
  t: Test,
  connection: Connection,
  transactionHandler: PayerTransactionHandler,
  payer: PublicKey,
  vaultAuthority: PublicKey,
): Promise<InitVaultInstructionAccounts & { vaultPair: Keypair }> {
  // -----------------
  // Create External Account
  // -----------------
  const [createExternalAccountIxs, createExternalAccountSigners, { externalPriceAccount }] =
    await createExternalPriceAccount(connection, payer);

  const priceMint = QUOTE_MINT;

  addressLabels.addLabels({ externalPriceAccount, priceMint });

  // -----------------
  // Setup Init Vault Accounts
  // -----------------
  const [setupAccountsIxs, setupAccountsSigners, initVaultAccounts] =
    await InitVault.setupInitVaultAccounts(connection, {
      payer,
      vaultAuthority,
      priceMint,
      externalPriceAccount,
    });

  addressLabels.addLabels(initVaultAccounts);

  const createAndSetupAccountsTx = new Transaction()
    .add(...createExternalAccountIxs)
    .add(...setupAccountsIxs);

  const createAndSetupAccountsRes = await transactionHandler.sendAndConfirmTransaction(
    createAndSetupAccountsTx,
    [...createExternalAccountSigners, ...setupAccountsSigners],
  );

  assertConfirmedTransaction(t, createAndSetupAccountsRes.txConfirmed);
  assertTransactionSummary(t, createAndSetupAccountsRes.txSummary, {
    msgRx: [/Update External Price Account/i, /InitializeMint/i, /InitializeAccount/i, /success/],
  });

  return initVaultAccounts;
}

export async function initVault(t: Test, args: { allowFurtherShareCreation?: boolean } = {}) {
  const { transactionHandler, connection, payer, payerPair, vaultAuthority, vaultAuthorityPair } =
    await init();
  const initVaultAccounts = await setupInitVaultAccounts(
    t,
    connection,
    transactionHandler,
    payer,
    vaultAuthority,
  );
  const { allowFurtherShareCreation = false } = args;
  const initVaultIx = await InitVault.initVault(initVaultAccounts, {
    allowFurtherShareCreation,
  });

  const initVaultTx = new Transaction().add(initVaultIx);
  await transactionHandler.sendAndConfirmTransaction(initVaultTx, []);

  const fractionMintAuthority = await pdaForVault(initVaultAccounts.vault);
  addressLabels.addLabels({ fractionMintAuthority });

  return {
    connection,
    transactionHandler,
    accounts: {
      payer,
      payerPair,
      vaultAuthorityPair,
      fractionMintAuthority,
      ...initVaultAccounts,
    },
  };
}

export async function initAndActivateVault(
  t: Test,
  args: { allowFurtherShareCreation?: boolean; numberOfShares?: number } = {},
) {
  const { numberOfShares = 0 } = args;
  const { transactionHandler, connection, accounts: initVaultAccounts } = await initVault(t, args);
  const {
    vault,
    authority: vaultAuthority,
    vaultAuthorityPair,
    fractionMint,
    fractionTreasury,
  } = initVaultAccounts;

  addressLabels.addLabels(initVaultAccounts);

  const accounts: ActivateVaultAccounts = {
    vault,
    vaultAuthority,
    fractionMint,
    fractionTreasury,
  };

  const activateVaultIx = await activateVault(vault, accounts, numberOfShares);

  const tx = new Transaction().add(activateVaultIx);
  const signers = [vaultAuthorityPair];
  await transactionHandler.sendAndConfirmTransaction(tx, signers);

  return {
    connection,
    transactionHandler,
    accounts: initVaultAccounts,
  };
}
