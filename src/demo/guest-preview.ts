import type { GuestEvent, GuestLanguage } from "../domain/guest-contract";

export type RsvpStatus = "not-invited" | "pending" | "accepted" | "declined";
export type GuestInvitation = { event: GuestEvent; invited: boolean; rsvpStatus: RsvpStatus };
export type GuestRecord = {
  id: string;
  name: string;
  company: string;
  categoryId: string;
  categoryName: string;
  groupId?: string;
  groupName?: string;
  country: string;
  preferredLanguage: GuestLanguage;
  phone?: string;
  email?: string;
  invitations: GuestInvitation[];
  stay?: { hotelId: string; hotelName: string; roomNumber: string };
};
export type GuestCategory = { id: string; name: string };
export type GuestAgendaItem = { id: string; date: string; time: string; title: string; details?: string };
export type GuestGroup = {
  id: string;
  name: string;
  primaryPersonId?: string;
  secondaryPersonId?: string;
  primaryName?: string;
  secondaryName?: string;
  guestCount: number;
  agenda: GuestAgendaItem[];
};
export type GuestTravelPlan = {
  id: string;
  name: string;
  event: GuestEvent;
  date: string;
  mode: string;
  routeName: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  categories: GuestCategory[];
  stops: { id: string; order: number; time: string; place: string }[];
};
export type GuestHotel = { id: string; name: string; address: string; roomsHeld: number };
export type GuestSnapshot = {
  guests: GuestRecord[];
  categories: GuestCategory[];
  groups: GuestGroup[];
  travelPlans: GuestTravelPlan[];
  hotels: GuestHotel[];
};

export const previewGuestSnapshot: GuestSnapshot = {
  categories: [
    { id: "customer", name: "Customer" },
    { id: "employee", name: "Employee" },
    { id: "dealer", name: "Dealer" },
    { id: "international", name: "International" },
  ],
  groups: [
    {
      id: "japan-delegation",
      name: "Japan delegation",
      primaryPersonId: "preview-core",
      secondaryPersonId: "movement-team",
      primaryName: "Preview coordinator",
      secondaryName: "Movement team",
      guestCount: 18,
      agenda: [
        { id: "ja-1", date: "2026-11-15", time: "07:45", title: "Meet in the hotel lobby" },
        { id: "ja-2", date: "2026-11-15", time: "08:00", title: "Coach leaves for YIL Malur" },
        { id: "ja-3", date: "2026-11-15", time: "09:00", title: "Guest registration" },
        { id: "ja-4", date: "2026-11-18", time: "16:45", title: "Leave hotel for Taj West End" },
      ],
    },
    {
      id: "germany-delegation",
      name: "Germany delegation",
      primaryPersonId: "preview-core",
      secondaryPersonId: "communications-team",
      primaryName: "Preview coordinator",
      secondaryName: "Communications team",
      guestCount: 8,
      agenda: [
        { id: "de-1", date: "2026-11-15", time: "08:15", title: "Meet in the hotel lobby" },
        { id: "de-2", date: "2026-11-15", time: "08:30", title: "Coach leaves for YIL Malur" },
        { id: "de-3", date: "2026-11-18", time: "17:00", title: "Leave hotel for Taj West End" },
      ],
    },
    {
      id: "india-customer-group",
      name: "India customer group",
      primaryPersonId: "venue-team",
      secondaryPersonId: "transport-team",
      primaryName: "Venue team",
      secondaryName: "Transport team",
      guestCount: 32,
      agenda: [{ id: "in-1", date: "2026-11-18", time: "17:30", title: "Guest arrival at Taj West End" }],
    },
  ],
  guests: [
    { id: "g-1", name: "Aiko Tanaka", company: "Example Industries", categoryId: "international", categoryName: "International", groupId: "japan-delegation", groupName: "Japan delegation", country: "Japan", preferredLanguage: "japanese", phone: "+819000000001", email: "aiko@example.test", invitations: [{ event: "malur", invited: true, rsvpStatus: "accepted" }, { event: "taj", invited: true, rsvpStatus: "pending" }], stay: { hotelId: "hotel-central", hotelName: "Central Bengaluru Hotel", roomNumber: "508" } },
    { id: "g-2", name: "Kenji Sato", company: "Example Hydraulics", categoryId: "international", categoryName: "International", groupId: "japan-delegation", groupName: "Japan delegation", country: "Japan", preferredLanguage: "japanese", phone: "+819000000002", invitations: [{ event: "malur", invited: true, rsvpStatus: "pending" }, { event: "taj", invited: true, rsvpStatus: "accepted" }] },
    { id: "g-3", name: "Anna Weber", company: "Example GmbH", categoryId: "international", categoryName: "International", groupId: "germany-delegation", groupName: "Germany delegation", country: "Germany", preferredLanguage: "german", phone: "+491500000003", email: "anna@example.test", invitations: [{ event: "malur", invited: true, rsvpStatus: "accepted" }, { event: "taj", invited: true, rsvpStatus: "accepted" }], stay: { hotelId: "hotel-garden", hotelName: "Garden City Hotel", roomNumber: "214" } },
    { id: "g-4", name: "Markus Fischer", company: "Example GmbH", categoryId: "international", categoryName: "International", groupId: "germany-delegation", groupName: "Germany delegation", country: "Germany", preferredLanguage: "german", email: "markus@example.test", invitations: [{ event: "malur", invited: true, rsvpStatus: "pending" }, { event: "taj", invited: true, rsvpStatus: "pending" }] },
    { id: "g-5", name: "Ananya Rao", company: "Example Customer", categoryId: "customer", categoryName: "Customer", groupId: "india-customer-group", groupName: "India customer group", country: "India", preferredLanguage: "english", phone: "+919000000005", email: "ananya@example.test", invitations: [{ event: "malur", invited: false, rsvpStatus: "not-invited" }, { event: "taj", invited: true, rsvpStatus: "accepted" }] },
    { id: "g-6", name: "Ravi Kumar", company: "Example Dealer", categoryId: "dealer", categoryName: "Dealer", groupId: "india-customer-group", groupName: "India customer group", country: "India", preferredLanguage: "english", phone: "+919000000006", email: "ravi@example.test", invitations: [{ event: "malur", invited: true, rsvpStatus: "declined" }, { event: "taj", invited: true, rsvpStatus: "pending" }] },
  ],
  travelPlans: [
    { id: "route-japan-malur", name: "Japan coach to Malur", event: "malur", date: "2026-11-15", mode: "Coach", routeName: "Central hotel to YIL Malur", vehicleNumber: "KA 01 AB 5001", driverName: "Driver to be confirmed", categories: [{ id: "international", name: "International" }], stops: [{ id: "s-1", order: 1, time: "08:00", place: "Central Bengaluru Hotel" }, { id: "s-2", order: 2, time: "09:00", place: "YIL Malur registration gate" }] },
    { id: "route-customer-taj", name: "Customer coach to Taj", event: "taj", date: "2026-11-18", mode: "Coach", routeName: "YIL guest house to Taj West End", categories: [{ id: "customer", name: "Customer" }, { id: "dealer", name: "Dealer" }], stops: [{ id: "s-3", order: 1, time: "16:45", place: "YIL guest house" }, { id: "s-4", order: 2, time: "17:30", place: "Taj West End" }] },
  ],
  hotels: [
    { id: "hotel-central", name: "Central Bengaluru Hotel", address: "Central Bengaluru", roomsHeld: 45 },
    { id: "hotel-garden", name: "Garden City Hotel", address: "Bengaluru", roomsHeld: 30 },
  ],
};
