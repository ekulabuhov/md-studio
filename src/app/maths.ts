const FIX32_INT_BITS = 22;
const FIX32_FRAC_BITS = 32 - FIX32_INT_BITS;

export function FIX32(value: number) {
  return Math.floor((1 << FIX32_FRAC_BITS) * value);
}

export function fix32ToInt(value: number) {
  return value >> FIX32_FRAC_BITS;
}