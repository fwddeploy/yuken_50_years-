import type { GuestLanguage, MessageChannel, MessagePurpose, MessageTemplate } from "./guest-contract";

type TemplateCopy = { subject?: string; body: string };

const copy: Record<MessagePurpose, Record<GuestLanguage, TemplateCopy>> = {
  invitation: {
    english: { subject: "Invitation: {{event_name}} — {{event_date}}", body: "Dear {{guest_name}},\n\nYou are warmly invited to {{event_name}} on {{event_date}}.\n\nPlease respond here: {{rsvp_link}}" },
    german: { subject: "Einladung: {{event_name}} — {{event_date}}", body: "Guten Tag {{guest_name}},\n\nwir laden Sie herzlich zu {{event_name}} am {{event_date}} ein.\n\nBitte antworten Sie hier: {{rsvp_link}}" },
    japanese: { subject: "ご招待：{{event_name}}（{{event_date}}）", body: "{{guest_name}} 様\n\n{{event_date}}開催の{{event_name}}へ謹んでご招待申し上げます。\n\nご出欠はこちらからご回答ください：{{rsvp_link}}" },
  },
  agenda: {
    english: { subject: "Your agenda for {{agenda_date}}", body: "Hello {{guest_name}},\n\nYour agenda for {{agenda_date}} is:\n{{agenda_lines}}" },
    german: { subject: "Ihr Tagesprogramm für den {{agenda_date}}", body: "Guten Tag {{guest_name}},\n\nIhr Tagesprogramm für den {{agenda_date}}:\n{{agenda_lines}}" },
    japanese: { subject: "{{agenda_date}}のご予定", body: "{{guest_name}} 様\n\n{{agenda_date}}のご予定です。\n{{agenda_lines}}" },
  },
  travel: {
    english: { subject: "Travel details for {{travel_date}}", body: "Hello {{guest_name}},\n\nRoute: {{route_name}}\nVehicle: {{vehicle_number}}\nDriver: {{driver_name}} — {{driver_phone}}\n\nStops:\n{{travel_stops}}" },
    german: { subject: "Reiseinformationen für den {{travel_date}}", body: "Guten Tag {{guest_name}},\n\nRoute: {{route_name}}\nFahrzeug: {{vehicle_number}}\nFahrer: {{driver_name}} — {{driver_phone}}\n\nHaltestellen:\n{{travel_stops}}" },
    japanese: { subject: "{{travel_date}}の移動情報", body: "{{guest_name}} 様\n\nルート：{{route_name}}\n車両：{{vehicle_number}}\nドライバー：{{driver_name}} — {{driver_phone}}\n\n停車場所：\n{{travel_stops}}" },
  },
  stay: {
    english: { subject: "Your hotel and room details", body: "Hello {{guest_name}},\n\nHotel: {{hotel_name}}\nRoom: {{room_number}}" },
    german: { subject: "Ihre Hotel- und Zimmerinformationen", body: "Guten Tag {{guest_name}},\n\nHotel: {{hotel_name}}\nZimmer: {{room_number}}" },
    japanese: { subject: "ホテルと客室のご案内", body: "{{guest_name}} 様\n\nホテル：{{hotel_name}}\n客室：{{room_number}}" },
  },
};

export const DEFAULT_MESSAGE_TEMPLATES = (["invitation", "agenda", "travel", "stay"] as MessagePurpose[]).flatMap(purpose =>
  (["whatsapp", "email"] as MessageChannel[]).flatMap(channel =>
    (["english", "german", "japanese"] as GuestLanguage[]).map(language => ({
      id: `${purpose}-${channel}-${language}-v1`,
      purpose,
      channel,
      language,
      subject: channel === "email" ? copy[purpose][language].subject : undefined,
      body: copy[purpose][language].body,
      approved: false,
    } satisfies MessageTemplate)),
  ),
);
