import test from 'tape';

import {
  addressLabels,
  assertInactiveVault,
  assertIsNotNull,
  initVault,
  killStuckProcess,
  spokSamePubkey,
} from './utils';
import { Transaction } from '@solana/web3.js';
import { assertConfirmedTransaction, assertTransactionSummary } from '@metaplex-foundation/amman';
import {
  addTokenToInactiveVault,
  AddTokenToInactiveVaultInstructionAccounts,
  Key,
  SafetyDepositBox,
  SafetyDepositSetup,
} from '../src/mpl-token-vault';
import spok from 'spok';

killStuckProcess();

test('inactive vault: add tokens once', async (t) => {
  const {
    transactionHandler,
    connection,
    accounts: initVaultAccounts,
  } = await initVault(t, { allowFurtherShareCreation: true });
  const { payer, vault, authority: vaultAuthority, vaultAuthorityPair } = initVaultAccounts;

  // -----------------
  // Prepare vault accounts for Safety Deposit
  // -----------------
  const TOKEN_AMOUNT = 2;

  const safetyDepositSetup = await SafetyDepositSetup.create(connection, {
    payer,
    vault,
    mintAmount: TOKEN_AMOUNT,
  });

  const { safetyDeposit, transferAuthority, store, tokenMint, tokenAccount } = safetyDepositSetup;
  addressLabels.addLabels({
    tokenMint,
    tokenAccount,
    safetyDeposit,
    store,
    transferAuthority,
  });

  // -----------------
  // Setup Add Token Instruction
  // -----------------
  const addTokenIx = await addTokenToInactiveVault(safetyDepositSetup, { payer, vaultAuthority });

  // -----------------
  // Submit and verify transaction
  // -----------------
  const tx = new Transaction().add(...safetyDepositSetup.instructions).add(addTokenIx);
  const signers = [...safetyDepositSetup.signers, vaultAuthorityPair];

  const res = await transactionHandler.sendAndConfirmTransaction(tx, signers);
  assertConfirmedTransaction(t, res.txConfirmed);
  assertTransactionSummary(t, res.txSummary, {
    msgRx: [
      /InitializeMint/i,
      /Transfer \d+ lamports to.+ associated token account/i,
      /Approve/i,
      /Add token to vault/i,
      /Transfer/i,
    ],
  });

  // -----------------
  // Verify account states
  // -----------------
  const safetyDepositAccountInfo = await connection.getAccountInfo(safetyDeposit);
  assertIsNotNull(t, safetyDepositAccountInfo);
  const [safetyDepositAccount] = SafetyDepositBox.fromAccountInfo(safetyDepositAccountInfo);

  spok(t, safetyDepositAccount, {
    $topic: 'safetyDepositAccount',
    key: Key.SafetyDepositBoxV1,
    vault: spokSamePubkey(vault),
    tokenMint: spokSamePubkey(tokenMint),
    store: spokSamePubkey(store),
  });

  await assertInactiveVault(t, connection, initVaultAccounts, {
    allowFurtherShareCreation: true,
    tokenTypeCount: 1,
  });
});
