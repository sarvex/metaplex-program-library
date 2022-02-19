import test from 'tape';

import { addressLabels, initAndActivateVault, killStuckProcess } from './utils';
import { Transaction } from '@solana/web3.js';
import { combineVault, CombineVaultSetup, Vault } from '../src/mpl-token-vault';

killStuckProcess();

test('combine vault: active vault with 0 shares and then combine it', async (t) => {
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
  await combineSetup.createOutstandingShares(payer);
  await combineSetup.createPayment(payer);
  combineSetup.approveTransfers(payer);
  combineSetup.assertComplete();

  addressLabels.findAndAddLabels(combineSetup);

  const combineIx = await combineVault(combineSetup);

  {
    const tx = new Transaction().add(...combineSetup.instructions).add(combineIx);
    const res = await transactionHandler.sendAndConfirmTransaction(tx, [
      ...combineSetup.signers,
      combineSetup.transferAuthorityPair,
      vaultAuthorityPair,
    ]);

    console.log(res.txSignature);
    console.log((await Vault.fromAccountAddress(connection, vault)).pretty());
  }
});
