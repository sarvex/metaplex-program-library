import { Connection, Keypair, PublicKey, Signer, TransactionInstruction } from '@solana/web3.js';
import { createTokenAccount, getTokenRentExempt, pdaForVault } from '../common/helpers';
import { CombineVaultInstructionAccounts, createCombineVaultInstruction } from '../generated';
import { strict as assert } from 'assert';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';

export type CombineVaultAccounts = Omit<CombineVaultInstructionAccounts, 'fractionBurnAuthority'>;

type HasOutstandingShares = CombineVaultSetup & {
  yourOutstandingShares: PublicKey;
  yourOutstandingSharesPair: Keypair;
};

type HasPayment = CombineVaultSetup & {
  yourPayment: PublicKey;
  yourPaymentPair: Keypair;
};

type HasTransferAuthority = CombineVaultSetup & {
  transferAuthority: PublicKey;
  transferAuthorityPair: Keypair;
};

export type CombineVaultSetupComplete = CombineVaultSetup &
  HasOutstandingShares &
  HasPayment &
  HasTransferAuthority;

export class CombineVaultSetup {
  readonly instructions: TransactionInstruction[] = [];
  readonly signers: Signer[] = [];

  yourOutstandingShares?: PublicKey;
  yourOutstandingSharesPair?: Keypair;

  yourPayment?: PublicKey;
  yourPaymentPair?: Keypair;

  transferAuthority?: PublicKey;
  transferAuthorityPair?: Keypair;

  private constructor(
    private readonly connection: Connection,
    readonly vault: PublicKey,
    readonly vaultAuthority: PublicKey,
    readonly newVaultAuthority: PublicKey,
    readonly fractionMint: PublicKey,
    readonly fractionTreasury: PublicKey,
    readonly redeemTreasury: PublicKey,
    readonly priceMint: PublicKey,
    readonly externalPricing: PublicKey,
    readonly fractionBurnAuthority: PublicKey,
  ) {}

  /**
   * 1. Create Combine Setup to setup necessary accounts
   */
  static async create(
    connection: Connection,
    accounts: {
      vault: PublicKey;
      vaultAuthority: PublicKey;
      newVaultAuthority?: PublicKey;
      fractionMint: PublicKey;
      fractionTreasury: PublicKey;
      redeemTreasury: PublicKey;
      priceMint: PublicKey;
      externalPricing: PublicKey;
    },
  ) {
    const { newVaultAuthority = accounts.vaultAuthority, vault } = accounts;
    const fractionBurnAuthority = await pdaForVault(vault);

    return new CombineVaultSetup(
      connection,
      accounts.vault,
      accounts.vaultAuthority,
      newVaultAuthority,
      accounts.fractionMint,
      accounts.fractionTreasury,
      accounts.redeemTreasury,
      accounts.priceMint,
      accounts.externalPricing,
      fractionBurnAuthority,
    );
  }

  /**
   * 2. Create outstanding shares account.
   *    Here we assume that there aren't any and thus don't mint any to the account we create
   */
  async createOutstandingShares(payer: PublicKey) {
    assert(!this.hasOutstandingShares(), 'cannot provide/create outstanding shares twice');
    const rentExempt = await getTokenRentExempt(this.connection);
    const [instructions, signers, { tokenAccount, tokenAccountPair }] = createTokenAccount(
      payer,
      rentExempt,
      this.fractionMint,
      payer,
    );

    this.instructions.push(...instructions);
    this.signers.push(...signers);
    this.yourOutstandingShares = tokenAccount;
    this.yourOutstandingSharesPair = tokenAccountPair;

    return this;
  }

  /**
   * 3. Create payment account
   */
  async createPayment(payer: PublicKey) {
    assert(!this.hasPayment(), 'cannot provide/create payment twice');
    const rentExempt = await getTokenRentExempt(this.connection);
    const [instructions, signers, { tokenAccount, tokenAccountPair }] = createTokenAccount(
      payer,
      rentExempt,
      this.priceMint,
      payer,
    );

    this.instructions.push(...instructions);
    this.signers.push(...signers);
    this.yourPayment = tokenAccount;
    this.yourPaymentPair = tokenAccountPair;

    return this;
  }

  /**
   * 4. Approve Outstanding Shares and Payment Transfers
   *    We need to approve even though we assume that no outstanding shares
   *    will have to be transferred.
   *
   * Adds {@link CombineVaultSetup.transferAuthorityPair} to this setup. Make
   * sure to include it with the combine vault instructions signers.
   */
  approveTransfers(payer: PublicKey) {
    assert(this.hasOutstandingShares(), 'need to provide or create outstandingShares first');
    assert(this.hasPayment(), 'need to provide or create payment first');
    assert(!this.hasTransferAuthority(), 'cannot approve twice');

    const transferAuthorityPair = Keypair.generate();
    this.transferAuthority = transferAuthorityPair.publicKey;
    this.transferAuthorityPair = transferAuthorityPair;

    const instructions = [
      Token.createApproveInstruction(
        TOKEN_PROGRAM_ID,
        this.yourOutstandingShares,
        this.transferAuthority,
        payer, // owner
        [], // multi signers
        0,
      ),
      Token.createApproveInstruction(
        TOKEN_PROGRAM_ID,
        this.yourPayment,
        this.transferAuthority,
        payer, // owner
        [], // multi signers
        0,
      ),
    ];
    this.instructions.push(...instructions);

    return this;
  }

  // -----------------
  // Guards
  // -----------------
  hasOutstandingShares(): this is HasOutstandingShares {
    return this.yourOutstandingShares != null;
  }

  hasPayment(): this is HasPayment {
    return this.yourPayment != null;
  }

  hasTransferAuthority(): this is HasTransferAuthority {
    return this.transferAuthority != null && this.transferAuthorityPair != null;
  }

  assertComplete(): asserts this is CombineVaultSetupComplete {
    assert(this.hasOutstandingShares(), 'need to provide or create outstandingShares');
    assert(this.hasPayment(), 'need to provide or create payment');
    assert(this.hasTransferAuthority(), 'need to approve transfer or add transferAuthority');
  }

  // -----------------
  // Accounts
  // -----------------
  get accounts(): CombineVaultInstructionAccounts {
    this.assertComplete();
    return {
      vault: this.vault,
      vaultAuthority: this.vaultAuthority,
      newVaultAuthority: this.newVaultAuthority,
      fractionMint: this.fractionMint,
      fractionTreasury: this.fractionTreasury,
      redeemTreasury: this.redeemTreasury,
      yourOutstandingShares: this.yourOutstandingShares,
      yourPayment: this.yourPayment,
      transferAuthority: this.transferAuthority,
      fractionBurnAuthority: this.fractionBurnAuthority,
      externalPricing: this.externalPricing,
    };
  }
}
/**
 * Accounts required by the _CombineVault_ instruction
 *
 * @property [_writable_] vault Initialized activated token vault
 * @property [_writable_] yourOutstandingShares Token account containing your portion of the outstanding fraction shares
 * @property [_writable_] yourPayment Token account of the redeem_treasury mint type that you will pay with
 * @property [_writable_] fractionMint Fraction mint
 * @property [_writable_] fractionTreasury Fraction treasury account
 * @property [_writable_] redeemTreasury Redeem treasury account
 * @property [] newVaultAuthority New authority on the vault going forward - can be same authority if you want
 * @property [**signer**] vaultAuthority Authority on the vault
 * @property [**signer**] transferAuthority Transfer authority for the token account and outstanding fractional shares account you're transferring from
 * @property [] fractionBurnAuthority PDA-based Burn authority for the fraction treasury account containing the uncirculated shares seed [PREFIX, program_id]
 * @property [] externalPricing External pricing lookup address
 * @category Instructions
 * @category CombineVault
 * @category generated
 */

/**
 * Combines the vault and as part of that mints {@link numberOfShares} to the
 * {@link CombineVaultInstructionAccounts.fractionTreasury}.
 *
 * The {@link CombineVaultInstructionAccounts.fractionBurnAuthority} is derived from the `vault` key
 *
 * ### Conditions for {@link CombineVaultInstructionAccounts} accounts to add token to vault
 *
 * _Aside from the conditions outlined in detail in {@link InitVault.initVault}_ the following should hold:
 *
 * #### vault
 *
 * - state: {@link VaultState.Active}
 * - fractionMint: fractionMint address
 * - redeemTreasury: redeemTreasury address
 *
 * #### yourPayment
 *
 * - mint: externalPricingLookup.mint
 * - amount: >= whatYouOwe (see Calculations)
 *
 * #### redeemTreasury
 *
 * - mint: externalPricingLookup.mint
 *
 * #### outstandingShares
 *
 * - mint: fractionMint address
 *
 * #### fractionBurnAuthority
 *
 * - address: vault PDA (`[PREFIX, PROGRAM_ID, vault_address]`)
 *
 * #### externalPricing
 *
 * - allowedToCombine: true
 *
 * ### Calculations
 *
 * ```
 * totalMarketCap       = fractionMint.supply * externalPricing.pricePerShare
 * storedMarketCap      = fractionTreasury.amount * externalPricing.pricePerShare
 * circulatingMarketCap = totalMarketCap - storedMarketCap
 * yourShareValue       = outstandingShares.amount * externalPricing.pricePerShare
 * whatYouOwe           = circulatingMarketCap - yourShareValue
 * ```
 *
 * ### Updates as Result of successful Transaction
 *
 * #### yourPayment
 *
 * - debit: whatYouOwe (transferred to redeemTreasury)
 *
 * #### redeemTreasury
 *
 * - credit: whatYouOwe (transferred from yourPayment)
 *
 * #### burn
 *
 * - yourOutstandingShares.amount of fractionMint
 * - fractionTreasury.amount of fractionMint
 *
 * #### vault
 *
 * - state: {@link VaultState.Combined}
 * - authority: newAuthority address
 * - lockedPricePerShare: externalPricing.pricePerShare
 *
 * @category CombineVault
 * @cateogry Instructions
 */
export async function combineVault(combineSetup: CombineVaultSetup) {
  return createCombineVaultInstruction(combineSetup.accounts);
}
