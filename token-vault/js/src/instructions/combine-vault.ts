import { pdaForVault } from '../common/helpers';
import { CombineVaultInstructionAccounts, createCombineVaultInstruction } from '../generated';

export type CombineVaultAccounts = Omit<CombineVaultInstructionAccounts, 'fractionBurnAuthority'>;

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
 * @category CombineVault:Instructions
 */
export async function combineVault(accounts: CombineVaultAccounts) {
  const fractionBurnAuthority = await pdaForVault(accounts.vault);
  return createCombineVaultInstruction({ ...accounts, fractionBurnAuthority });
}
