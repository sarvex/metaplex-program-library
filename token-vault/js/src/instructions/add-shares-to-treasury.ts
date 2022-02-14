import { bignum } from '@metaplex-foundation/beet';
import { Connection, Keypair, PublicKey, Signer, TransactionInstruction } from '@solana/web3.js';
import { strict as assert } from 'assert';
import { approveTokenTransfer, createVaultOwnedTokenAccount, mintTokens } from '../common/helpers';
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

  initSourceAccount = async () => {
    assert(this.source == null, 'source was already provided');
    const [createSourceIxs, createSourceSigners, { tokenAccount: source }] =
      await createVaultOwnedTokenAccount(
        this.connection,
        this.payer,
        this.vault,
        this.fractionMint,
      );
    this.instructions.push(...createSourceIxs);
    this.signers.push(...createSourceSigners);
    this.source = source;

    return this;
  };

  mintSharesToSource = async () => {
    assert(this.source != null, 'init source first via initSourceAccount');
    const mintTokensIx = mintTokens(
      this.fractionMint,
      this.source,
      this.payer,
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
      owner: this.payer,
      tokenAccount: this.source,
      amount: this.numberOfShares,
    });
    this.instructions.push(approveTransferIx);
    this.transferAuthority = transferAuthorityPair.publicKey;
    this.transferAuthorityPair = transferAuthorityPair;

    return this;
  };

  static create(
    connection: Connection,
    args: {
      payer: PublicKey;
      vault: PublicKey;
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
  const signers = [setup.transferAuthorityPair];
  return [[ix], signers];
}
