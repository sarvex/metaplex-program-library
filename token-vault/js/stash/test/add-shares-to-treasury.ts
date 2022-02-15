import test from 'tape';

import { addressLabels, initAndActivateVault, initVault, killStuckProcess } from './utils';
import { Signer, Transaction } from '@solana/web3.js';
import { assertConfirmedTransaction } from '@metaplex-foundation/amman';
import {
  addSharesToTreasury,
  AddSharesToTreasurySetup,
} from '../src/instructions/add-shares-to-treasury';
import { getMint } from '../src/common/helpers.mint';
import {
  activateVault,
  ActivateVaultAccounts,
  addTokenToInactiveVault,
  SafetyDepositSetup,
} from '../src/instructions';

killStuckProcess();

test('add shares: active vault with one token added add 5 shares', async (t) => {
  const NUMBER_OF_SHARES = 5;
  // -----------------
  // Init Vault
  // -----------------
  const { transactionHandler, connection, accounts: initVaultAccounts } = await initVault(t);
  const {
    vault,
    payer,
    authority: vaultAuthority,
    vaultAuthorityPair,
    vaultPair,
    fractionMint,
    fractionTreasury,
    fractionMintAuthority,
  } = initVaultAccounts;

  addressLabels.addLabels(initVaultAccounts);

  // -----------------
  // Add Token
  // -----------------
  const TOKEN_AMOUNT = 2;

  const safetyDepositSetup = await SafetyDepositSetup.create(connection, {
    payer,
    vault,
    mintAmount: TOKEN_AMOUNT,
  });
  addressLabels.findAndAddLabels(safetyDepositSetup);
  {
    const addTokenIx = await addTokenToInactiveVault(safetyDepositSetup, { payer, vaultAuthority });
    const tx = new Transaction().add(...safetyDepositSetup.instructions).add(addTokenIx);
    const signers = [
      ...safetyDepositSetup.signers,
      safetyDepositSetup.transferAuthorityPair,
      vaultAuthorityPair,
    ];

    const res = await transactionHandler.sendAndConfirmTransaction(tx, signers);
    assertConfirmedTransaction(t, res.txConfirmed);
  }

  // -----------------
  // Activate Vault
  // -----------------
  {
    const accounts: ActivateVaultAccounts = {
      vault,
      vaultAuthority,
      fractionMint,
      fractionTreasury,
    };
    const activateVaultIx = await activateVault(vault, accounts, NUMBER_OF_SHARES);

    const tx = new Transaction().add(activateVaultIx);
    const signers = [vaultAuthorityPair];

    const res = await transactionHandler.sendAndConfirmTransaction(tx, signers);
    assertConfirmedTransaction(t, res.txConfirmed);
  }
  // -----------------
  // Add Shares to Treasury
  // -----------------
  const setup = AddSharesToTreasurySetup.create(connection, {
    payer,
    vault,
    vaultAuthority,
    fractionTreasury,
    fractionMint,
    numberOfShares: NUMBER_OF_SHARES,
  });
  const { instructions: setupIxs, signers: setupSigners } = await setup.initSourceAccount(
    safetyDepositSetup.store,
  );
  // .then(setup.mintSharesToSource);
  // .then(setup.approveTransfer);

  addressLabels.findAndAddLabels(setup);

  const [addSharesIxs, addSharesSigners] = await addSharesToTreasury(setup, vaultAuthority);

  const tx = new Transaction().add(...setupIxs).add(...addSharesIxs);
  const signers: Signer[] = [...setupSigners, ...addSharesSigners, vaultAuthorityPair];
  console.log(addressLabels.resolveKeypairs(signers));

  const res = await transactionHandler.sendAndConfirmTransaction(tx, signers);
  assertConfirmedTransaction(t, res.txConfirmed);

  console.log(res);
});
