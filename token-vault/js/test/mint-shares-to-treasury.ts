import test from 'tape';

import {
  Account,
  addressLabels,
  assertIsNotNull,
  getAccount,
  getVault,
  initAndActivateVault,
  initVault,
  killStuckProcess,
  spokSameBignum,
  spokSamePubkey,
} from './utils';
import { Signer, Transaction } from '@solana/web3.js';
import {
  assertConfirmedTransaction,
  assertTransactionSummary,
  tokenBalanceFor,
  tokenBalancesOfTransaction,
} from '@metaplex-foundation/amman';
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
import { mintSharesToTreasury } from '../src/instructions/mint-shares-to-treasury';
import { MintFractionalSharesInstructionAccounts } from '../src/mpl-token-vault';
import spok, { Specifications } from 'spok';
import { bignum } from '@metaplex-foundation/beet';
import BN from 'bn.js';

killStuckProcess();

test('mint shares: active vault which allows further share creation, mint various sizes 0 - 5,000,000,000', async (t) => {
  // -----------------
  // Init and Activate Vault
  // -----------------
  const {
    transactionHandler,
    connection,
    accounts: initVaultAccounts,
  } = await initAndActivateVault(t, { allowFurtherShareCreation: true });
  const {
    vault,
    authority: vaultAuthority,
    vaultAuthorityPair,
    fractionMint,
    fractionTreasury,
    fractionMintAuthority,
  } = initVaultAccounts;

  addressLabels.addLabels(initVaultAccounts);

  // -----------------
  // Mint Shares
  // -----------------
  const accounts: MintFractionalSharesInstructionAccounts = {
    fractionTreasury,
    fractionMint,
    vault,
    vaultAuthority,
    mintAuthority: fractionMintAuthority,
  };
  const signers: Signer[] = [vaultAuthorityPair];

  async function runAndVerify(numberOfShares: bignum, previouslyMinted: bignum) {
    t.comment(`++++++ Minting ${numberOfShares} shares`);
    const mintSharesIx = mintSharesToTreasury(accounts, numberOfShares);

    const tx = new Transaction().add(mintSharesIx);
    const res = await transactionHandler.sendAndConfirmTransaction(tx, signers);
    assertConfirmedTransaction(t, res.txConfirmed);
    assertTransactionSummary(t, res.txSummary, {
      msgRx: [/Mint new fractional shares/i, /MintTo/i, /success/i],
    });

    const expectedTotal = new BN(numberOfShares).add(new BN(previouslyMinted));

    // Ensure the mint authority minted the tokens
    const tokenBalance = await tokenBalanceFor(connection, {
      sig: res.txSignature,
      mint: fractionMint,
      owner: fractionMintAuthority,
    });
    spok(t, tokenBalance, {
      $topic: 'tokenBalance fractionMintAuthority',
      amountPre: spokSameBignum(previouslyMinted),
      amountPost: spokSameBignum(expectedTotal),
    });

    // Ensure fractionTreasury received the tokens
    const fractionTreasuryAccount = await getAccount(connection, fractionTreasury);
    spok(t, fractionTreasuryAccount, <Specifications<Partial<Account>>>{
      $topic: 'fractionTreasuryAccount',
      address: spokSamePubkey(fractionTreasury),
      mint: spokSamePubkey(fractionMint),
      owner: spokSamePubkey(fractionMintAuthority),
      amount: spokSameBignum(expectedTotal),
    });
  }

  await runAndVerify(0, 0);
  await runAndVerify(5, 0);
  await runAndVerify(new BN('5000000000' /* 5,000,000,000 */), 5);
});
