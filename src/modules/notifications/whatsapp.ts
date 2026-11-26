/**
 * Constrói um deep-link oficial `wa.me` sanitizado com encodeURIComponent.
 * Custo zero no piloto e zero risco de banimento (sem bots não oficiais).
 */
export function buildWhatsAppDeepLink(
  whatsappE164: string,
  message: string,
): string | null {
  const digits = whatsappE164.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    return null;
  }

  const sanitizedMessage = message.trim();
  if (!sanitizedMessage) {
    return `https://wa.me/${digits}`;
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(sanitizedMessage)}`;
}
