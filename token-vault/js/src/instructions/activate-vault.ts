import { bignum } from '@metaplex-foundation/beet';
import { PublicKey } from '@solana/web3.js';
import { pdaForVault } from '../common/helpers';
import { ActivateVaultInstructionAccounts, createActivateVaultInstruction } from '../generated';
import type { Optional } from 'utility-types';

/**
 * Same as {@link ActivateVaultInstructionAccounts} except doesn't require
 * fractionalMintAuthority as that will be derived before passing them to
 * {@link createActivateVaultInstruction}.
 *
 * @property [writable] vault Initialized inactivated fractionalized token vault
 * @property [writable] fractionMint Fraction mint
 * @property [writable] fractionTreasury Fraction treasury
 * @property [signer] vaultAuthority Authority on the vault
 */
export type ActivateVaultAccounts = Optional<
  ActivateVaultInstructionAccounts,
  'fractionalMintAuthority'
>;

/**
 * Activates the vault and as part of that mints {@link numberOfShares} to the
 * {@link ActivateVaultInstructionAccounts['fractionTreasury']}.
 *
 * Unless provided the {@link ActivateVaultInstructionAccounts['fractionalMintAuthority']}
 * is derived from the `vault` key
 */
export async function activateVault(
  vault: PublicKey,
  accounts: ActivateVaultAccounts,
  numberOfShares: bignum,
) {
  const fractionalMintAuthority = accounts.fractionalMintAuthority ?? (await pdaForVault(vault));
  return createActivateVaultInstruction(
    { ...accounts, fractionalMintAuthority },
    { numberOfShareArgs: { numberOfShares } },
  );
}
