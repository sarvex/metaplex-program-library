import test from 'tape';

import {
  addressLabels,
  assertInactiveVault,
  assertIsNotNull,
  initVault,
  killStuckProcess,
  spokSamePubkey,
} from './utils';
import { Transaction, TransactionInstruction } from '@solana/web3.js';
import { assertConfirmedTransaction, assertTransactionSummary } from '@metaplex-foundation/amman';
import {
  addTokenToInactiveVault,
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

  addressLabels.findAndAddLabels(safetyDepositSetup);

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
  const { safetyDeposit, tokenMint, store } = safetyDepositSetup;
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

test('inactive vault: add tokens thrice via three different safety deposit boxes', async (t) => {
  const {
    transactionHandler,
    connection,
    accounts: initVaultAccounts,
  } = await initVault(t, { allowFurtherShareCreation: true });
  const { payer, vault, authority: vaultAuthority, vaultAuthorityPair } = initVaultAccounts;

  async function verifyAccountStates(
    safetyDepositSetup: SafetyDepositSetup,
    tokenTypeCount: number,
  ) {
    const { safetyDeposit, tokenMint, store } = safetyDepositSetup;
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
      tokenTypeCount,
    });
  }

  async function submitAndVerifyTransaction(
    safetyDepositSetup: SafetyDepositSetup,
    addTokenIx: TransactionInstruction,
  ) {
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
  }

  {
    const TOKEN_AMOUNT = 2;
    t.comment(`++++ 1. Adding tokens with amount ${TOKEN_AMOUNT}`);

    const safetyDepositSetup = await SafetyDepositSetup.create(connection, {
      payer,
      vault,
      mintAmount: TOKEN_AMOUNT,
    });

    const addTokenIx = await addTokenToInactiveVault(safetyDepositSetup, { payer, vaultAuthority });
    await submitAndVerifyTransaction(safetyDepositSetup, addTokenIx);
    await verifyAccountStates(safetyDepositSetup, 1);
  }

  {
    const TOKEN_AMOUNT = 3333;
    t.comment(`++++ 2. Adding tokens with amount ${TOKEN_AMOUNT}`);

    const safetyDepositSetup = await SafetyDepositSetup.create(connection, {
      payer,
      vault,
      mintAmount: TOKEN_AMOUNT,
    });

    const addTokenIx = await addTokenToInactiveVault(safetyDepositSetup, { payer, vaultAuthority });
    await submitAndVerifyTransaction(safetyDepositSetup, addTokenIx);
    await verifyAccountStates(safetyDepositSetup, 2);
  }

  {
    const TOKEN_AMOUNT = 3333;
    t.comment(`++++ 3. Adding tokens with amount ${TOKEN_AMOUNT}`);

    const safetyDepositSetup = await SafetyDepositSetup.create(connection, {
      payer,
      vault,
      mintAmount: TOKEN_AMOUNT,
    });

    const addTokenIx = await addTokenToInactiveVault(safetyDepositSetup, { payer, vaultAuthority });
    await submitAndVerifyTransaction(safetyDepositSetup, addTokenIx);
    await verifyAccountStates(safetyDepositSetup, 3);
  }
});

// TODO(thlorenz): Here we only include the _happy path_ tests not even covering all possibilities
// More tests should be added especially the ones confirming that incorrectly
// setup accounts are handled correctly by returning an error from the program.
