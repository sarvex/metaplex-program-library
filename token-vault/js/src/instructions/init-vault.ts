import { AccountLayout as TokenAccountLayout, MintLayout } from '@solana/spl-token';
import { Connection, Keypair, PublicKey, SystemProgram } from '@solana/web3.js';
import { VAULT_PROGRAM_PUBLIC_KEY } from '../common/consts';
import { createMint, createTokenAccount, pdaForVault } from '../common/helpers';
import {
  createInitVaultInstruction,
  InitVaultArgs,
  InitVaultInstructionAccounts,
  Vault,
} from '../generated';
import { InstructionsWithAccounts } from '../types';

/**
 * Exposes two methods essential to initializing a vault properly.
 * @category Instructions
 */
export class InitVault {
  /**
   * Sets up the accounts needed to conform to the conditions outlined in
   * {@link InitVault.initVault} in order to initialize a vault with them.
   * Use this method if you don't have those accounts setup already.
   *
   * See {@link InitVaultInstructionAccounts} for more information about those accounts.
   * @param args
   *  - externalPriceAccount should be created via {@link import('./create-external-price-account').createExternalPriceAccount}
   *
   * @category Instructions
   */
  static async setupInitVaultAccounts(
    connection: Connection,
    args: {
      payer: PublicKey;
      vaultAuthority: PublicKey;
      priceMint: PublicKey;
      externalPriceAccount: PublicKey;
    },
  ): Promise<InstructionsWithAccounts<InitVaultInstructionAccounts & { vaultPair: Keypair }>> {
    // -----------------
    // Rent Exempts
    // -----------------
    const tokenAccountRentExempt = await connection.getMinimumBalanceForRentExemption(
      TokenAccountLayout.span,
    );

    const mintRentExempt = await connection.getMinimumBalanceForRentExemption(MintLayout.span);
    const vaultRentExempt = await Vault.getMinimumBalanceForRentExemption(connection);

    // -----------------
    // Account Setups
    // -----------------
    const { vaultPair: vault, vaultPDA } = await vaultAccountPDA();

    const [fractionMintIxs, fractionMintSigners, { mintAccount: fractionMint }] = createMint(
      args.payer,
      mintRentExempt,
      0,
      vaultPDA, // mintAuthority
      vaultPDA, // freezeAuthority
    );

    const [redeemTreasuryIxs, redeemTreasurySigners, { tokenAccount: redeemTreasury }] =
      createTokenAccount(
        args.payer,
        tokenAccountRentExempt,
        args.priceMint, // mint
        vaultPDA, // owner
      );

    const [fractionTreasuryIxs, fractionTreasurySigners, { tokenAccount: fractionTreasury }] =
      createTokenAccount(
        args.payer,
        tokenAccountRentExempt,
        fractionMint, // mint
        vaultPDA, // owner
      );

    const uninitializedVaultIx = SystemProgram.createAccount({
      fromPubkey: args.payer,
      newAccountPubkey: vault.publicKey,
      lamports: vaultRentExempt,
      space: Vault.byteSize,
      programId: VAULT_PROGRAM_PUBLIC_KEY,
    });

    return [
      [...fractionMintIxs, ...redeemTreasuryIxs, ...fractionTreasuryIxs, uninitializedVaultIx],
      [...fractionMintSigners, ...redeemTreasurySigners, ...fractionTreasurySigners, vault],
      {
        fractionMint,
        redeemTreasury,
        fractionTreasury,
        vault: vault.publicKey,
        vaultPair: vault,
        authority: args.vaultAuthority,
        pricingLookupAddress: args.externalPriceAccount,
      },
    ];
  }

  /**
   * Initializes the Vault.
   *
   * ### Conditions for {@link InitVaultInstructionAccounts} accounts to Init a Vault
   *
   * When setting up the vault accounts via
   * {@link InitVault.setupInitVaultAccounts} those conditions will be met.
   *
   * All accounts holding data need to be _initialized_ and _rent exempt_.
   *
   * #### Vault
   *
   * - owned by: Vault Program
   * - is uninitialized
   *
   * #### pricingLookupAddress
   *
   * - provides: {@link ExternalPriceAccount} data
   *
   * #### fractionMint
   *
   * - owned by: Token Program
   * - supply: 0
   * - mintAuthority: vault PDA (`[PREFIX, PROGRAM_ID, vault_address]`)
   * - freezeAuthority: vault PDA (`[PREFIX, PROGRAM_ID, vault_address]`)
   *
   * #### fractionTreasury
   *
   * - owned by: Token Program
   * - amount: 0
   * - owner: vault PDA (`[PREFIX, PROGRAM_ID, vault_address]`)
   * - delegate: unset
   * - closeAuthority: unset
   * - mint: fractionMint address
   *
   * #### redeemTreasury
   *
   * - owned by: Token Program
   * - amount: 0
   * - owner: vault PDA (`[PREFIX, PROGRAM_ID, vault_address]`)
   * - delegate: unset
   * - closeAuthority: unset
   * - mint: externalPriceAccount.priceMint (via pricingLookupAddress)
   *
   * ### Vault Account updates as Result of successfull Init
   *
   * - key: {@link Key}.VaultV1
   * - accounts: addresses set to the provided accounts
   * - tokenTypeCount: 0
   * - state: {@link VaultState}.Inactive
   *
   * @category Instructions
   *
   * @param accounts set them up via {@link InitVault.setupInitVaultAccounts}
   */
  static async initVault(accounts: InitVaultInstructionAccounts, initVaultArgs: InitVaultArgs) {
    return createInitVaultInstruction(accounts, {
      initVaultArgs,
    });
  }
}

async function vaultAccountPDA() {
  const vaultPair = Keypair.generate();
  const vaultPDA = await pdaForVault(vaultPair.publicKey);
  return { vaultPair, vaultPDA };
}
