import { asc, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { groupAgendaItems, guestCategories, guestEventInvitations, guestGroups, guestStays, guests, hotels, people, travelPlanCategories, travelPlans, travelStops } from "../../../../db/schema";
import { authenticateRequest } from "../../../../src/server/session";

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const db = getDb();
  const [categoryRows, groupRows, guestRows, invitationRows, agendaRows, planRows, planCategoryRows, stopRows, hotelRows, stayRows, peopleRows] = await Promise.all([
    db.select({ id: guestCategories.id, name: guestCategories.name }).from(guestCategories).where(eq(guestCategories.active, true)).orderBy(asc(guestCategories.name)),
    db.select().from(guestGroups).where(eq(guestGroups.active, true)).orderBy(asc(guestGroups.name)),
    db.select({ id: guests.id, name: guests.name, company: guests.company, categoryId: guests.categoryId, categoryName: guestCategories.name, groupId: guests.groupId, country: guests.country, preferredLanguage: guests.preferredLanguage, phone: guests.phone, email: guests.email })
      .from(guests).innerJoin(guestCategories, eq(guestCategories.id, guests.categoryId)).where(eq(guests.active, true)).orderBy(asc(guests.name)),
    db.select({ guestId: guestEventInvitations.guestId, event: guestEventInvitations.event, invited: guestEventInvitations.invited, rsvpStatus: guestEventInvitations.rsvpStatus }).from(guestEventInvitations),
    db.select().from(groupAgendaItems).where(eq(groupAgendaItems.active, true)).orderBy(asc(groupAgendaItems.agendaDate), asc(groupAgendaItems.agendaTime)),
    db.select().from(travelPlans).where(eq(travelPlans.active, true)).orderBy(asc(travelPlans.travelDate), asc(travelPlans.name)),
    db.select({ travelPlanId: travelPlanCategories.travelPlanId, id: guestCategories.id, name: guestCategories.name }).from(travelPlanCategories).innerJoin(guestCategories, eq(guestCategories.id, travelPlanCategories.categoryId)).where(eq(guestCategories.active, true)),
    db.select().from(travelStops).where(eq(travelStops.active, true)).orderBy(asc(travelStops.stopOrder)),
    db.select({ id: hotels.id, name: hotels.name, address: hotels.address, roomsHeld: hotels.roomsHeld }).from(hotels).where(eq(hotels.active, true)).orderBy(asc(hotels.name)),
    db.select({ guestId: guestStays.guestId, hotelId: guestStays.hotelId, roomNumber: guestStays.roomNumber }).from(guestStays),
    db.select({ id: people.id, fullName: people.fullName }).from(people).where(eq(people.active, true)),
  ]);

  const personName = new Map(peopleRows.map(person => [person.id, person.fullName]));
  const groupName = new Map(groupRows.map(group => [group.id, group.name]));
  const hotelName = new Map(hotelRows.map(hotel => [hotel.id, hotel.name]));
  const invitationsByGuest = groupBy(invitationRows, row => row.guestId);
  const agendaByGroup = groupBy(agendaRows, row => row.groupId);
  const categoriesByPlan = groupBy(planCategoryRows, row => row.travelPlanId);
  const stopsByPlan = groupBy(stopRows, row => row.travelPlanId);
  const stayByGuest = new Map(stayRows.map(stay => [stay.guestId, stay]));
  const guestCountByGroup = new Map<string, number>();
  for (const guest of guestRows) if (guest.groupId) guestCountByGroup.set(guest.groupId, (guestCountByGroup.get(guest.groupId) ?? 0) + 1);

  return Response.json({
    categories: categoryRows,
    groups: groupRows.map(group => ({ id: group.id, name: group.name, primaryPersonId: group.primaryPersonId ?? undefined, secondaryPersonId: group.secondaryPersonId ?? undefined, primaryName: group.primaryPersonId ? personName.get(group.primaryPersonId) : undefined, secondaryName: group.secondaryPersonId ? personName.get(group.secondaryPersonId) : undefined, guestCount: guestCountByGroup.get(group.id) ?? 0, agenda: (agendaByGroup.get(group.id) ?? []).map(item => ({ id: item.id, date: item.agendaDate, time: item.agendaTime, title: item.title, details: item.details || undefined })) })),
    guests: guestRows.map(guest => {
      const stay = stayByGuest.get(guest.id);
      return { ...guest, groupId: guest.groupId ?? undefined, groupName: guest.groupId ? groupName.get(guest.groupId) : undefined, phone: guest.phone ?? undefined, email: guest.email ?? undefined, invitations: invitationsByGuest.get(guest.id) ?? [], stay: stay ? { hotelId: stay.hotelId, hotelName: hotelName.get(stay.hotelId) ?? "Hotel", roomNumber: stay.roomNumber } : undefined };
    }),
    travelPlans: planRows.map(plan => ({ id: plan.id, name: plan.name, event: plan.event, date: plan.travelDate, mode: plan.mode, routeName: plan.routeName, vehicleNumber: plan.vehicleNumber ?? undefined, driverName: plan.driverName ?? undefined, driverPhone: plan.driverPhone ?? undefined, categories: categoriesByPlan.get(plan.id) ?? [], stops: (stopsByPlan.get(plan.id) ?? []).map(stop => ({ id: stop.id, order: stop.stopOrder, time: stop.stopTime, place: stop.place })) })),
    hotels: hotelRows,
  }, { headers: { "Cache-Control": "no-store" } });
}

function groupBy<T, K>(rows: T[], key: (row: T) => K) {
  const result = new Map<K, T[]>();
  for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]);
  return result;
}
