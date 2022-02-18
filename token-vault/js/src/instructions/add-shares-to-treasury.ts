import { bignum } from '@metaplex-foundation/beet';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  approveTokenTransfer,
  createTokenAccount,
  getTokenRentExempt,
  mintTokens,
} from '../common/helpers';
import {
  AddSharesToTreasuryInstructionAccounts,
  createAddSharesToTreasuryInstruction,
} from '../generated';
import { InstructionsWithAccounts } from '../types';

export async function createAddSharesSourceAccount(
  connection: Connection,
  args: {
    payer: PublicKey;
    fractionMint: PublicKey;
    fractionMintAuthority: PublicKey;
    amount: bignum;
  },
): Promise<
  InstructionsWithAccounts<{
    source: PublicKey;
    sourcePair: Keypair;
    transferAuthorityPair: Keypair;
  }>
> {
  const { payer, fractionMint, fractionMintAuthority, amount } = args;
  const rentExempt = await getTokenRentExempt(connection);
  const [
    createIxs,
    createSigners,
    { tokenAccount: source, tokenAccountPair: sourcePair },
  ] = createTokenAccount(payer, rentExempt, fractionMint, payer);

  const mintIx = mintTokens(fractionMint, source, fractionMintAuthority, amount);

  const [approveTransferIx, transferAuthorityPair] = approveTokenTransfer({
    owner: payer,
    sourceAccount: source,
    amount,
  });

  return [
    [...createIxs, mintIx, approveTransferIx],
    createSigners,
    { source, sourcePair, transferAuthorityPair },
  ];
}

/**
 * Adds the specified amount of shares to the treasury.
 *
 * ### Conditions for {@link AddSharesToTreasuryInstructionAccounts} accounts to add shares
 *
 * _Aside from the conditions outlined in detail in {@link InitVault.initVault}_ the following should hold:
 *
 * #### vault
 *
 * - state: {@link VaultState.Active}
 *
 * ### source
 *
 * - account: initialized
 * - mint: vault.fractionMint
 * - amount: >= numberOfShares
 */
export function addSharesToTreasury(
  accounts: AddSharesToTreasuryInstructionAccounts,
  numberOfShares: bignum,
) {
  return createAddSharesToTreasuryInstruction(accounts, { numberOfShareArgs: { numberOfShares } });
}
