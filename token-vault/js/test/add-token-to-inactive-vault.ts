import test from 'tape';

import {
  addressLabels,
  assertInactiveVault,
  initVault,
  killStuckProcess,
  spokSamePubkey,
} from './utils';
import { Transaction } from '@solana/web3.js';
import { assertConfirmedTransaction, assertTransactionSummary } from '@metaplex-foundation/amman';
import {
  AddTokenToInactiveVault,
  AddTokenToInactiveVaultInstructionAccounts,
  Key,
  SafetyDepositBox,
} from '../src/mpl-token-vault';
import spok from 'spok';

killStuckProcess();

test('inactive vault: add token', async (t) => {
  const {
    transactionHandler,
    connection,
    accounts: initVaultAccounts,
  } = await initVault(t, { allowFurtherShareCreation: true });
  const { payer, vault, authority: vaultAuthority, vaultAuthorityPair } = initVaultAccounts;

  // -----------------
  // Prepare vault accounts
  // -----------------
  const TOKEN_AMOUNT = 2;

  const [createMintIxs, createMintSigners, { mintAccount }] =
    await AddTokenToInactiveVault.createTokenMint(connection, payer);

  const inactiveVault = new AddTokenToInactiveVault(connection, vault, vaultAuthority, mintAccount);

  const safetyDeposit = await inactiveVault.getSafetyDepositAccount();
  const [tokenAccountIxs, tokenAccountSigners, { tokenAccount }] =
    await inactiveVault.createTokenAccount(payer, TOKEN_AMOUNT);
  const [storeAccountIxs, storeAccountSigners, { storeAccount }] =
    await inactiveVault.createStoreAccount(payer, vault);
  const [approveTransferIxs, approveTransferSigners, { transferAuthority, transferAuthorityPair }] =
    await AddTokenToInactiveVault.approveTransferAuthority(payer, tokenAccount, TOKEN_AMOUNT);

  addressLabels.addLabels({
    mintAccount,
    tokenAccount,
    safetyDeposit,
    storeAccount,
    transferAuthority,
  });

  // -----------------
  // Setup Add Token Instruction
  // -----------------
  const accounts: Omit<AddTokenToInactiveVaultInstructionAccounts, 'systemAccount'> = {
    safetyDepositAccount: safetyDeposit,
    tokenAccount,
    store: storeAccount,
    vault,
    vaultAuthority,
    payer,
    transferAuthority,
  };

  const addTokenIx = await inactiveVault.addTokenToInactiveVault({ amount: 2 }, accounts);

  // -----------------
  // Setup Prepare Accounts + Add Token Transaction
  // -----------------
  const tx = new Transaction()
    .add(...createMintIxs)
    .add(...tokenAccountIxs)
    .add(...storeAccountIxs)
    .add(...approveTransferIxs)
    .add(addTokenIx);

  const signers = [
    ...createMintSigners,
    ...tokenAccountSigners,
    ...storeAccountSigners,
    ...approveTransferSigners,
    transferAuthorityPair,
    vaultAuthorityPair,
  ];

  // -----------------
  // Submit and verify transaction
  // -----------------
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
  const [safetyDepositAccount] = SafetyDepositBox.fromAccountInfo(safetyDepositAccountInfo);
  spok(t, safetyDepositAccount, {
    $topic: 'safetyDepositAccount',
    key: Key.SafetyDepositBoxV1,
    vault: spokSamePubkey(vault),
    tokenMint: spokSamePubkey(mintAccount),
    store: spokSamePubkey(storeAccount),
  });

  await assertInactiveVault(t, connection, initVaultAccounts, {
    allowFurtherShareCreation: true,
    tokenTypeCount: 1,
  });
});
