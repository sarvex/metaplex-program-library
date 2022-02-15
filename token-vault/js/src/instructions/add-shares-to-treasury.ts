// TODO(thlorenz): WIP revisit once we have mint shares implemented
import { bignum } from '@metaplex-foundation/beet';
import { Connection, Keypair, PublicKey, Signer, TransactionInstruction } from '@solana/web3.js';
import { strict as assert } from 'assert';
import {
  approveTokenTransfer,
  /*
  createAssociatedTokenAccount,
  createMint,
  createTokenAccount,
  createVaultOwnedTokenAccount,
  getTokenRentExempt,
  */
  mintTokens,
  pdaForVault,
} from '../common/helpers';
import { getMint } from '../common/helpers.mint';
import {
  AddSharesToTreasuryInstructionAccounts,
  AddSharesToTreasuryInstructionArgs,
  createAddSharesToTreasuryInstruction,
} from '../generated';

export class AddSharesToTreasurySetup {
  /** Instructions to run in order to setup this Safety Deposit Box*/
  readonly instructions: TransactionInstruction[] = [];
  /** Signers to include with the setup instructions */
  readonly signers: Signer[] = [];

  private constructor(
    /** Used for builder methods */
    readonly connection: Connection,
    /** Used to fund additional instructions added via builder methods */
    readonly payer: PublicKey,
    /** The initialized vault for which this transfer is executed */
    readonly vault: PublicKey,
    /** Treasury to which the shares are transferred */
    readonly fractionTreasury: PublicKey,
    /** The mint we are transferring */
    readonly fractionMint: PublicKey,

    /** The amount of shares to transfer to the treasury */
    readonly numberOfShares: bignum,

    /** The account from which the shares are transferred to the treasury */
    public source?: PublicKey,
    /**
     * Transfer Authority to move desired token amount from source account to
     * which happens as part of processing the add shares to treasury instruction.
     */
    public transferAuthority?: PublicKey,
    /** Make sure to include it as the signer when executing that transaction. */
    public transferAuthorityPair?: Keypair,
  ) {}

  initSourceAccount = async (source: PublicKey) => {
    assert(this.source == null, 'source was already provided');
    this.source = source;
    /*
    const [createSourceIxs, createSourceSigners, { tokenAccount }] = createTokenAccount(
      this.payer,
      sourceRentExempt,
      this.fractionMint,
      this.payer,
    );
    */

    /*
    const [createSourceIxs, createSourceSigners, { tokenAccount }] =
      await createVaultOwnedTokenAccount(
        this.connection,
        this.payer,
        this.vault,
        this.fractionMint,
      );
    */

    /*
    const [createSourceIx, tokenAccount] = await createAssociatedTokenAccount({
      tokenMint: this.fractionMint,
      tokenOwner: this.payer,
      payer: this.payer,
    });
    const createSourceIxs = [createSourceIx];
    const createSourceSigners: Signer[] = [];
    */

    /*
    this.instructions.push(...createSourceIxs);
    this.signers.push(...createSourceSigners);
    this.source = tokenAccount;
    */

    return this;
  };

  mintSharesToSource = async () => {
    assert(this.source != null, 'init source first via initSourceAccount');

    const mintAuthority = await pdaForVault(this.vault);
    const mint = await getMint(this.connection, this.fractionMint);
    assert(mint.mintAuthority != null, 'fractionMint should have mint authority');
    assert(
      new PublicKey(mint.mintAuthority).equals(mintAuthority),
      'fractionMint mint authority should match mint authority derived from vault PDA',
    );

    const mintTokensIx = mintTokens(
      this.fractionMint,
      this.source,
      mintAuthority,
      this.numberOfShares,
    );
    this.instructions.push(mintTokensIx);

    return this;
  };

  approveTransfer = async () => {
    assert(this.source != null, 'init source first via initSourceAccount');
    assert(this.transferAuthority == null, 'transferAuthority was already provided');
    assert(this.transferAuthorityPair == null, 'transferAuthorityPair was already provided');

    const [approveTransferIx, transferAuthorityPair] = approveTokenTransfer({
      owner: this.source,
      tokenAccount: this.fractionTreasury,
      amount: this.numberOfShares,
    });
    this.instructions.push(approveTransferIx);
    this.signers.push(transferAuthorityPair);
    this.transferAuthority = transferAuthorityPair.publicKey;
    this.transferAuthorityPair = transferAuthorityPair;

    return this;
  };

  static create(
    connection: Connection,
    args: {
      payer: PublicKey;
      vault: PublicKey;
      vaultAuthority: PublicKey;
      fractionTreasury: PublicKey;
      fractionMint: PublicKey;
      numberOfShares: bignum;
      source?: PublicKey;
      transferAuthority?: PublicKey;
      transferAuthorityPair?: Keypair;
    },
  ) {
    return new AddSharesToTreasurySetup(
      connection,
      args.payer,
      args.vault,
      args.fractionTreasury,
      args.fractionMint,
      args.numberOfShares,
      args.source,
      args.transferAuthority,
      args.transferAuthorityPair,
    );
  }
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
export async function addSharesToTreasury(
  setup: AddSharesToTreasurySetup,
  vaultAuthority: PublicKey,
): Promise<[TransactionInstruction[], Signer[]]> {
  assert(setup.source != null, 'init source first via initSourceAccount');
  assert(setup.transferAuthority != null, 'init transferAuthority first via approveTransfer');
  assert(
    setup.transferAuthorityPair != null,
    'init transferAuthorityPair first via approveTransfer',
  );
  const accounts: AddSharesToTreasuryInstructionAccounts = {
    source: setup.source,
    fractionTreasury: setup.fractionTreasury,
    vault: setup.vault,
    transferAuthority: setup.transferAuthority,
    vaultAuthority,
  };
  const args: AddSharesToTreasuryInstructionArgs = {
    numberOfShareArgs: { numberOfShares: setup.numberOfShares },
  };

  const ix = createAddSharesToTreasuryInstruction(accounts, args);
  const signers: Signer[] = [];
  return [[ix], signers];
}
