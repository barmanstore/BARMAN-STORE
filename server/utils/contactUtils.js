const createContactUtils = (deps = {}) => {
  const { normalizePhone } = deps;

  const parseOrderAddress = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') return value;
    const raw = String(value || '').trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return { street: raw };
    }
  };

  const getNormalizedPhoneFromUnknownText = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const direct = normalizePhone(raw);
    if (direct) return direct;
    const candidates = raw.match(/\+?[0-9][0-9\s().-]{8,}/g) || [];
    for (const candidate of candidates) {
      const normalized = normalizePhone(candidate);
      if (normalized) return normalized;
    }
    return '';
  };

  const getDistributorWhatsappPhone = (distributor = null) => {
    if (!distributor) return '';
    const direct = getNormalizedPhoneFromUnknownText(distributor.phone);
    if (direct) return direct;

    const contactsRaw = distributor.contacts;
    if (!contactsRaw) return '';
    if (typeof contactsRaw === 'object') {
      const objectCandidates = [
        contactsRaw.phone,
        contactsRaw.mobile,
        contactsRaw.whatsapp,
        contactsRaw.primary_phone,
        contactsRaw.contact,
      ];
      for (const candidate of objectCandidates) {
        const normalized = getNormalizedPhoneFromUnknownText(candidate);
        if (normalized) return normalized;
      }
      if (Array.isArray(contactsRaw.phones)) {
        for (const candidate of contactsRaw.phones) {
          const normalized = getNormalizedPhoneFromUnknownText(candidate);
          if (normalized) return normalized;
        }
      }
    }

    const contactsText = String(contactsRaw || '').trim();
    if (!contactsText) return '';
    try {
      const parsed = JSON.parse(contactsText);
      if (parsed && typeof parsed === 'object') {
        const parsedCandidates = [
          parsed.phone,
          parsed.mobile,
          parsed.whatsapp,
          parsed.primary_phone,
          parsed.contact,
        ];
        for (const candidate of parsedCandidates) {
          const normalized = getNormalizedPhoneFromUnknownText(candidate);
          if (normalized) return normalized;
        }
        if (Array.isArray(parsed.phones)) {
          for (const candidate of parsed.phones) {
            const normalized = getNormalizedPhoneFromUnknownText(candidate);
            if (normalized) return normalized;
          }
        }
      }
    } catch (_) {
      // plain-text contacts are handled below
    }

    return getNormalizedPhoneFromUnknownText(contactsText);
  };

  return {
    parseOrderAddress,
    getNormalizedPhoneFromUnknownText,
    getDistributorWhatsappPhone,
  };
};

module.exports = { createContactUtils };
