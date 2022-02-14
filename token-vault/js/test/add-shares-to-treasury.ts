import test from 'tape';

import { addressLabels, initAndActivateVault, killStuckProcess } from './utils';
import { Transaction } from '@solana/web3.js';
import { assertConfirmedTransaction } from '@metaplex-foundation/amman';
import {
  addSharesToTreasury,
  AddSharesToTreasurySetup,
} from '../src/instructions/add-shares-to-treasury';

killStuckProcess();

test('add shares: active vault with no tokens added add 5 shares', async (t) => {
  const NUMBER_OF_SHARES = 5;
  const {
    transactionHandler,
    connection,
    accounts: initAndActivateVaultAccounts,
  } = await initAndActivateVault(t);
  const {
    vault,
    payer,
    authority: vaultAuthority,
    vaultAuthorityPair,
    fractionMint,
    fractionTreasury,
  } = initAndActivateVaultAccounts;

  addressLabels.addLabels(initAndActivateVaultAccounts);

  const setup = AddSharesToTreasurySetup.create(connection, {
    payer,
    vault,
    fractionTreasury,
    fractionMint,
    numberOfShares: NUMBER_OF_SHARES,
  });

  const { instructions: setupIxs, signers: setupSigners } = await setup
    .initSourceAccount()
    .then(setup.mintSharesToSource)
    .then(setup.approveTransfer);

  const [addSharesIxs, addSharesSigners] = await addSharesToTreasury(setup, vaultAuthority);

  const tx = new Transaction().add(...setupIxs).add(...addSharesIxs);
  const signers = [...setupSigners, ...addSharesSigners, vaultAuthorityPair];

  const res = await transactionHandler.sendAndConfirmTransaction(tx, signers);
  assertConfirmedTransaction(t, res.txConfirmed);

  console.log(res);
});
