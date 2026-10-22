type R = Record<string, unknown>;

/** Frozen job customer snapshot keys. Jobs created before the customer-detail
 * fields were snapshotted carry only the base keys; current jobs carry all eight. */
export const CUSTOMER_SNAPSHOT_BASE_KEYS = ["id", "code", "displayName"] as const;
export const CUSTOMER_SNAPSHOT_DETAIL_KEYS = ["contactPhone", "contactPerson", "fax", "contractNumber", "serviceFrequency"] as const;
export const CUSTOMER_SERVICE_FREQUENCIES = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "ANNUALLY"] as const;
const detailMaxLength = { contactPhone: 40, contactPerson: 160, fax: 40, contractNumber: 160 } as const;

const isRecord = (value: unknown): value is R => typeof value === "object" && value !== null && !Array.isArray(value);
const nullableText = (value: unknown, maximum: number) => value === null || typeof value === "string" && value.trim().length > 0 && value.length <= maximum;

/** Strict key and detail-value check for a customer snapshot: either exactly the three
 * legacy keys, or the three plus all five detail keys. Unknown keys, partial detail sets,
 * wrong types, over-long text and an unknown serviceFrequency are all refused.
 * Callers still validate id/code/displayName with their own bounds. */
export function hasValidCustomerSnapshotKeys(value: unknown): value is R {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (!CUSTOMER_SNAPSHOT_BASE_KEYS.every((key) => Object.hasOwn(value, key))) return false;
  if (keys.length === CUSTOMER_SNAPSHOT_BASE_KEYS.length) return true;
  if (keys.length !== CUSTOMER_SNAPSHOT_BASE_KEYS.length + CUSTOMER_SNAPSHOT_DETAIL_KEYS.length
    || !CUSTOMER_SNAPSHOT_DETAIL_KEYS.every((key) => Object.hasOwn(value, key))) return false;
  return nullableText(value.contactPhone, detailMaxLength.contactPhone)
    && nullableText(value.contactPerson, detailMaxLength.contactPerson)
    && nullableText(value.fax, detailMaxLength.fax)
    && nullableText(value.contractNumber, detailMaxLength.contractNumber)
    && (value.serviceFrequency === null
      || typeof value.serviceFrequency === "string" && (CUSTOMER_SERVICE_FREQUENCIES as readonly string[]).includes(value.serviceFrequency));
}
