import test from 'tape';

import { assertInactiveVault, init, initInitVaultAccounts, killStuckProcess } from './utils';
import {
  assertConfirmedTransaction,
  assertError,
  assertTransactionSummary,
} from '@metaplex-foundation/amman';
import { Transaction } from '@solana/web3.js';
import { InitVault } from '../src/instructions/init-vault';

killStuckProcess();

test('init-vault: init vault allowing further share creation', async (t) => {
  const { transactionHandler, connection, payer, vaultAuthority } = await init();
  const initVaultAccounts = await initInitVaultAccounts(
    t,
    connection,
    transactionHandler,
    payer,
    vaultAuthority,
  );

  const initVaultIx = await InitVault.initVault(initVaultAccounts, {
    allowFurtherShareCreation: true,
  });

  const initVaulTx = new Transaction().add(initVaultIx);
  const initVaultRes = await transactionHandler.sendAndConfirmTransaction(initVaulTx, []);

  assertConfirmedTransaction(t, initVaultRes.txConfirmed);
  assertTransactionSummary(t, initVaultRes.txSummary, {
    msgRx: [/Init Vault/, /success/],
  });

  await assertInactiveVault(t, connection, initVaultAccounts, {
    allowFurtherShareCreation: true,
    tokenTypeCount: 0,
  });
});

test('init-vault: init vault not allowing further share creation', async (t) => {
  const { transactionHandler, connection, payer, vaultAuthority } = await init();
  const initVaultAccounts = await initInitVaultAccounts(
    t,
    connection,
    transactionHandler,
    payer,
    vaultAuthority,
  );

  const initVaultIx = await InitVault.initVault(initVaultAccounts, {
    allowFurtherShareCreation: false,
  });

  const initVaulTx = new Transaction().add(initVaultIx);
  const initVaultRes = await transactionHandler.sendAndConfirmTransaction(initVaulTx, []);

  assertConfirmedTransaction(t, initVaultRes.txConfirmed);
  assertTransactionSummary(t, initVaultRes.txSummary, {
    msgRx: [/Init Vault/, /success/],
  });

  await assertInactiveVault(t, connection, initVaultAccounts, {
    allowFurtherShareCreation: false,
    tokenTypeCount: 0,
  });
});

test('init-vault: init vault twice for same account', async (t) => {
  const { transactionHandler, connection, payer, vaultAuthority } = await init();
  const initVaultAccounts = await initInitVaultAccounts(
    t,
    connection,
    transactionHandler,
    payer,
    vaultAuthority,
  );

  {
    const initVaultIx = await InitVault.initVault(initVaultAccounts, {
      allowFurtherShareCreation: true,
    });

    const initVaulTx = new Transaction().add(initVaultIx);
    await transactionHandler.sendAndConfirmTransaction(initVaulTx, []);
  }
  {
    const initVaultIx = await InitVault.initVault(initVaultAccounts, {
      allowFurtherShareCreation: true,
    });

    const initVaulTx = new Transaction().add(initVaultIx);
    try {
      await transactionHandler.sendAndConfirmTransaction(initVaulTx, []);
    } catch (err) {
      assertError(t, err, [/Init Vault/i, /Already initialized/i]);
    }
  }
});
