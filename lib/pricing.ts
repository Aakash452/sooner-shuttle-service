export type PaymentMethod = "card" | "cash";

// Stripe's standard US card rate is 2.9% + $0.30 per successful charge. The
// exact amount Stripe takes varies by card type (Amex, international, etc),
// so this is a close estimate, not a guarantee — but it's what we gross the
// card price up by so the organizer nets the same $/rider either way.
export const STRIPE_PERCENT_FEE = 0.029;
export const STRIPE_FIXED_FEE_CENTS = 30;

/**
 * Given the amount we want to actually net (e.g. $20 × riders), returns the
 * total to charge on a card so that after Stripe's fee is taken out, we're
 * left with `netCents`. The fixed fee only applies once per charge, so this
 * must be computed on the whole-cart total, not per rider.
 */
export function cardTotalCents(netCents: number): number {
  const grossed = (netCents + STRIPE_FIXED_FEE_CENTS) / (1 - STRIPE_PERCENT_FEE);
  return Math.ceil(grossed);
}

/** The estimated processing fee portion of a card total (for display). */
export function cardFeeCents(netCents: number): number {
  return cardTotalCents(netCents) - netCents;
}
