/** Second active track enrollment is charged at 50% of full price. */
export const ENROLLMENT_DISCOUNT_RATE = 0.5;

/** Maximum concurrent active track enrollments per student. */
export const MAX_ACTIVE_TRACK_ENROLLMENTS = 2;

export type EnrollmentQuote = {
  activeEnrollmentCount: number;
  isDiscounted: boolean;
  pricePaid: number;
};

export function computeEnrollmentQuote(
  fullPrice: number,
  activeEnrollmentCount: number
): EnrollmentQuote {
  const isDiscounted = activeEnrollmentCount >= 1;

  const pricePaid = isDiscounted
    ? roundCurrency(fullPrice * ENROLLMENT_DISCOUNT_RATE)
    : roundCurrency(fullPrice);

  return {
    activeEnrollmentCount,
    isDiscounted,
    pricePaid,
  };
}

export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

export function formatTrackPrice(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export function toStripeUnitAmount(pricePaid: number): number {
  return Math.round(pricePaid * 100);
}
