import { Test } from 'tape';
import { Connection, PublicKey } from '@solana/web3.js';
import spok from 'spok';
import { InitVaultInstructionAccounts, Key, Vault, VaultState } from '../../src/generated';
import { spokSameBignum, spokSamePubkey } from './asserts';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

export async function assertInactiveVault(
  t: Test,
  connection: Connection,
  initVaultAccounts: InitVaultInstructionAccounts,
  args: { allowFurtherShareCreation: boolean; tokenTypeCount: number },
) {
  const {
    vault,
    authority: vaultAuthority,
    fractionMint,
    fractionTreasury,
    redeemTreasury,
    pricingLookupAddress,
  } = initVaultAccounts;

  const vaultAccountInfo = await connection.getAccountInfo(vault);
  const [vaultAccount] = Vault.fromAccountInfo(vaultAccountInfo);

  spok(t, vaultAccount, {
    $topic: 'vaultAccount',
    key: Key.VaultV1,
    tokenProgram: spokSamePubkey(TOKEN_PROGRAM_ID),
    fractionMint: spokSamePubkey(fractionMint),
    redeemTreasury: spokSamePubkey(redeemTreasury),
    fractionTreasury: spokSamePubkey(fractionTreasury),
    pricingLookupAddress: spokSamePubkey(pricingLookupAddress),
    authority: spokSamePubkey(vaultAuthority),
    allowFurtherShareCreation: args.allowFurtherShareCreation,
    tokenTypeCount: args.tokenTypeCount,
    state: VaultState.Inactive,
    lockedPricePerShare: spokSameBignum(0),
  });
}
