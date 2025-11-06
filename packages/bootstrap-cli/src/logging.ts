// Match keys containing sensitive keywords (case-insensitive):
// - TOKEN, SECRET, KEY, PASSWORD, CLIENT, AUTH (anywhere in the key name)
// - Handles prefix forms: STRIPE_SECRET_KEY, API_TOKEN
// - Handles suffix forms: SECRET_STRIPE, TOKEN_API
// - Handles compound forms: MY_API_TOKEN_VALUE
const SENSITIVE_PATTERN = /(TOKEN|SECRET|KEY|PASSWORD|CLIENT|AUTH)/i;

export function redactValue(key: string, value: string): string {
  if (!value) {
    return '<empty>';
  }
  if (!SENSITIVE_PATTERN.test(key)) {
    return value;
  }
  if (value.length <= 4) {
    return `${value[0]}***`;
  }
  const start = value.slice(0, 4);
  const end = value.slice(-2);
  return `${start}...${end}`;
}

export function formatRedactedMap(entries: Array<[string, string]>, indent = '  '): string {
  return entries.map(([key, value]) => `${indent}${key}=${value}`).join('\n');
}
