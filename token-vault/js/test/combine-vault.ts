import test from 'tape';

import {
  addressLabels,
  assertCombinedVault,
  initAndActivateVault,
  killStuckProcess,
  logDebug,
  verifyTokenBalance,
} from './utils';
import { Transaction } from '@solana/web3.js';
import { combineVault, CombineVaultSetup } from '../src/mpl-token-vault';
import {
  assertConfirmedTransaction,
  assertTransactionSummary,
  TokenBalances,
} from '@metaplex-foundation/amman';

killStuckProcess();

// -----------------
// Helpers
// -----------------

// -----------------
// Tests
// -----------------
test('combine vault: activate vault with 0 shares and then combine it', async (t) => {
  // -----------------
  // Init and Activate Vault
  // -----------------
  const {
    transactionHandler,
    connection,
    accounts: initVaultAccounts,
  } = await initAndActivateVault(t, { allowFurtherShareCreation: false, numberOfShares: 0 });
  const {
    vault,
    authority: vaultAuthority,
    vaultAuthorityPair,
    payer,
    priceMint,
    pricingLookupAddress,
    fractionMint,
    fractionTreasury,
    redeemTreasury,
  } = initVaultAccounts;

  addressLabels.addLabels(initVaultAccounts);

  // -----------------
  // Combine Vault
  // -----------------
  const combineSetup: CombineVaultSetup = await CombineVaultSetup.create(connection, {
    vault,
    vaultAuthority,
    fractionMint,
    fractionTreasury,
    redeemTreasury,
    priceMint,
    externalPricing: pricingLookupAddress,
  });
  await combineSetup.createOutstandingShares(payer);
  await combineSetup.createPayment(payer);
  combineSetup.approveTransfers(payer);
  combineSetup.assertComplete();

  addressLabels.findAndAddLabels(combineSetup);

  const combineIx = await combineVault(combineSetup);

  const tx = new Transaction().add(...combineSetup.instructions).add(combineIx);
  const res = await transactionHandler.sendAndConfirmTransaction(tx, [
    ...combineSetup.signers,
    combineSetup.transferAuthorityPair,
    vaultAuthorityPair,
  ]);

  assertConfirmedTransaction(t, res.txConfirmed);
  assertTransactionSummary(t, res.txSummary, {
    msgRx: [/Combine Vault/i, /Transfer/i, /Burn/i, /success/i],
  });

  await assertCombinedVault(t, connection, initVaultAccounts);
  // -----------------
  // Verify token balances
  // -----------------
  const tokens = TokenBalances.forTransaction(connection, res.txSignature, addressLabels);
  await tokens.dump(logDebug);
  await verifyTokenBalance(t, tokens, combineSetup.fractionTreasury, fractionMint, 0, 0);
  await verifyTokenBalance(t, tokens, combineSetup.redeemTreasury, priceMint, 0, 0);
  await verifyTokenBalance(t, tokens, combineSetup.yourOutstandingShares, fractionMint, 0, 0);
  await verifyTokenBalance(t, tokens, combineSetup.yourPayment, priceMint, 0, 0);
});

// test('combine-vault: attempt to combine inactive vault, fails', (t) => {});
