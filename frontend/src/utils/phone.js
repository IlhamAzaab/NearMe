export function normalizeSriLankaPhone(phone) {
  const p = String(phone || "")
    .trim()
    .replace(/[\s-]/g, "");

  let normalized = "";
  if (p.startsWith("+94")) {
    normalized = p;
  } else if (p.startsWith("94")) {
    normalized = `+${p}`;
  } else if (p.startsWith("0")) {
    normalized = `+94${p.slice(1)}`;
  } else {
    return null;
  }

  const canonicalDigits = normalized.replace(/\D/g, "");
  if (!/^947\d{8}$/.test(canonicalDigits)) {
    return null;
  }

  return `+${canonicalDigits}`;
}

export function isPhoneLikeIdentifier(identifier) {
  const cleaned = String(identifier || "")
    .trim()
    .replace(/[\s-]/g, "");
  return /^(\+94|94|0)7\d{8}$/.test(cleaned);
}
