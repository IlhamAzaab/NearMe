import { normalizeSriLankaPhone } from "../services/otpService.js";

function buildAuthPhoneCandidates(normalizedPhone) {
  const withoutPlus = normalizedPhone.slice(1);
  const localFormat = `0${normalizedPhone.slice(3)}`;
  return Array.from(new Set([normalizedPhone, withoutPlus, localFormat]));
}

export async function getAuthPhoneOwnership(supabaseClient, phone) {
  const normalizedPhone = normalizeSriLankaPhone(phone);
  if (!normalizedPhone) {
    return {
      normalizedPhone: null,
      ownerUserId: null,
    };
  }

  const candidates = buildAuthPhoneCandidates(normalizedPhone);
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseClient.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const users = data?.users || [];
    const matched = users.find((user) => {
      const userPhone = String(user?.phone || "").trim();
      return userPhone && candidates.includes(userPhone);
    });

    if (matched?.id) {
      return {
        normalizedPhone,
        ownerUserId: matched.id,
      };
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  return {
    normalizedPhone,
    ownerUserId: null,
  };
}
