import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { groupAgendaItems, guestCategories, guestEventInvitations, guestGroups, guestStays, guests, hotels, messageBatches, messageRecipients, messageTemplates, travelPlanCategories, travelPlans, travelStops } from "../../../../../db/schema";
import { GUEST_EVENT_DETAILS, preflightMessages, type GuestEvent, type MessageChannel, type MessagePreflightItem, type MessagePurpose } from "../../../../../src/domain/guest-contract";
import { authenticateRequest } from "../../../../../src/server/session";

type PreflightBody = { purpose?: MessagePurpose; channel?: MessageChannel; groupId?: string; event?: GuestEvent; agendaDate?: string; travelDate?: string; travelPlanId?: string; guestIds?: string[] };

export async function POST(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const body = await request.json() as PreflightBody;
  if (!isPurpose(body.purpose) || !isChannel(body.channel)) return Response.json({ error: "Message purpose and channel are required." }, { status: 400 });
  const guestIds = [...new Set((body.guestIds ?? []).map(id => id.trim()).filter(Boolean))];
  if (!guestIds.length || guestIds.length > 5000) return Response.json({ error: "Choose between 1 and 5,000 guests." }, { status: 400 });
  if (body.event !== undefined && body.event !== "malur" && body.event !== "taj") return Response.json({ error: "Event must be Malur or Taj." }, { status: 400 });
  if (body.purpose === "invitation" && !body.event) return Response.json({ error: "Choose Malur or Taj for this message." }, { status: 400 });
  const travelPlanId = body.travelPlanId?.trim();
  const travelDate = body.travelDate?.trim();
  if (body.purpose === "travel" && !travelPlanId && !/^\d{4}-\d{2}-\d{2}$/u.test(travelDate ?? "")) return Response.json({ error: "Choose the travel plan or the travel day to send." }, { status: 400 });
  if (body.purpose === "agenda" && (!body.groupId || !body.agendaDate)) return Response.json({ error: "Choose a guest group and agenda date." }, { status: 400 });

  const db = getDb();
  if (body.groupId) {
    const [group] = await db.select().from(guestGroups).where(and(eq(guestGroups.id, body.groupId), eq(guestGroups.active, true))).limit(1);
    if (!group) return Response.json({ error: "Guest group was not found." }, { status: 404 });
    if (!user.isCore && group.primaryPersonId !== user.personId && group.secondaryPersonId !== user.personId) return Response.json({ error: "Only this group's primary or secondary coordinator can send its messages." }, { status: 403 });
  }

  const guestRows = await db.select({ id: guests.id, name: guests.name, categoryId: guests.categoryId, groupId: guests.groupId, language: guests.preferredLanguage, phone: guests.phone, email: guests.email, categoryName: guestCategories.name })
    .from(guests).innerJoin(guestCategories, eq(guestCategories.id, guests.categoryId)).where(and(inArray(guests.id, guestIds), eq(guests.active, true)));
  if (guestRows.length !== guestIds.length) return Response.json({ error: "One or more selected guests changed. Refresh and review the current list." }, { status: 409 });
  if (body.groupId && guestRows.some(guest => guest.groupId !== body.groupId)) return Response.json({ error: "The selected audience contains a guest outside this group." }, { status: 409 });
  // A non-core coordinator manages only assigned guest groups — enforced for
  // EVERY purpose, not just group sends, so travel and stay audiences cannot
  // reach other coordinators' guests through a direct API call.
  if (!user.isCore) {
    const activeGroups = await db.select({ id: guestGroups.id, primaryPersonId: guestGroups.primaryPersonId, secondaryPersonId: guestGroups.secondaryPersonId }).from(guestGroups).where(eq(guestGroups.active, true));
    const coordinated = new Set(activeGroups.filter(group => group.primaryPersonId === user.personId || group.secondaryPersonId === user.personId).map(group => group.id));
    if (guestRows.some(guest => !guest.groupId || !coordinated.has(guest.groupId))) return Response.json({ error: "You can send messages only to guests in the groups you coordinate." }, { status: 403 });
  }

  const [templateRows, agendaRows, planRows, planCategoryRows, stopRows, stayRows, invitationRows] = await Promise.all([
    db.select().from(messageTemplates).where(and(eq(messageTemplates.purpose, body.purpose), eq(messageTemplates.channel, body.channel), eq(messageTemplates.status, "approved"))),
    body.groupId && body.agendaDate ? db.select().from(groupAgendaItems).where(and(eq(groupAgendaItems.groupId, body.groupId), eq(groupAgendaItems.agendaDate, body.agendaDate), eq(groupAgendaItems.active, true))) : Promise.resolve([]),
    body.purpose === "travel"
      ? travelPlanId
        ? db.select().from(travelPlans).where(and(eq(travelPlans.id, travelPlanId), eq(travelPlans.active, true)))
        : db.select().from(travelPlans).where(and(eq(travelPlans.travelDate, travelDate!), eq(travelPlans.active, true)))
      : Promise.resolve([]),
    db.select().from(travelPlanCategories),
    db.select().from(travelStops).where(eq(travelStops.active, true)),
    // Only hotels still on this year's list may be named in a message — a stay
    // whose hotel was removed by a Master Sheet pull must skip, not mislead.
    db.select({ guestId: guestStays.guestId, hotelId: guestStays.hotelId, roomNumber: guestStays.roomNumber, hotelName: hotels.name }).from(guestStays).innerJoin(hotels, and(eq(hotels.id, guestStays.hotelId), eq(hotels.active, true))).where(inArray(guestStays.guestId, guestIds)),
    body.purpose === "invitation" || body.purpose === "travel" ? db.select({ guestId: guestEventInvitations.guestId, event: guestEventInvitations.event, invited: guestEventInvitations.invited }).from(guestEventInvitations).where(inArray(guestEventInvitations.guestId, guestIds)) : Promise.resolve([]),
  ]);
  if (body.purpose === "travel" && !planRows.length) return Response.json({ error: travelPlanId ? "That travel plan no longer exists. Refresh and try again." : "There is no travel plan for that day yet." }, { status: 409 });
  const agendaLines = [...agendaRows].sort((a, b) => a.agendaTime.localeCompare(b.agendaTime)).map(item => `${item.agendaTime} — ${item.title}${item.details ? ` — ${item.details}` : ""}`).join("\n");
  const categoriesByPlan = groupBy(planCategoryRows, row => row.travelPlanId);
  const stopsByPlan = groupBy(stopRows, row => row.travelPlanId);
  const stayByGuest = new Map(stayRows.map(stay => [stay.guestId, stay]));
  const planByCategory = new Map<string, typeof planRows[number]>();
  for (const plan of planRows) for (const category of categoriesByPlan.get(plan.id) ?? []) planByCategory.set(category.categoryId, plan);
  const invitedTo = new Set(invitationRows.filter(row => row.invited).map(row => `${row.guestId}:${row.event}`));

  // Guests who are not invited to the event their message is about are set
  // aside BEFORE review — declined or withdrawn guests must never look 'ready'.
  const notInvited = new Map<string, string>();
  if (body.purpose === "invitation") {
    for (const guest of guestRows) if (!invitedTo.has(`${guest.id}:${body.event}`)) notInvited.set(guest.id, guest.name);
  }
  if (body.purpose === "travel") {
    for (const guest of guestRows) {
      const plan = planByCategory.get(guest.categoryId);
      if (plan && !invitedTo.has(`${guest.id}:${plan.event}`)) notInvited.set(guest.id, guest.name);
    }
  }

  const recipientInputs = guestRows.filter(guest => !notInvited.has(guest.id)).map(guest => {
    const plan = body.purpose === "travel" ? planByCategory.get(guest.categoryId) : undefined;
    const stay = stayByGuest.get(guest.id);
    // For travel the event comes from the guest's own plan, never from the
    // date — an added day (e.g. a 19 Nov Taj departure) stays a Taj message.
    const eventKey = body.purpose === "travel" ? plan?.event : body.event;
    const event = eventKey ? GUEST_EVENT_DETAILS[eventKey] : undefined;
    return { guestId: guest.id, guestName: guest.name, language: guest.language, phone: guest.phone, email: guest.email, variables: {
      guest_name: guest.name,
      event_name: event?.name,
      event_date: event ? formatDate(event.date) : undefined,
      rsvp_link: body.purpose === "invitation" ? "generated securely when the batch is sent" : undefined,
      agenda_date: body.agendaDate ? formatDate(body.agendaDate) : undefined,
      agenda_lines: agendaLines || undefined,
      travel_date: plan ? formatDate(plan.travelDate) : undefined,
      route_name: plan?.routeName,
      vehicle_number: plan?.vehicleNumber,
      driver_name: plan?.driverName,
      driver_phone: plan?.driverPhone,
      travel_stops: plan ? (stopsByPlan.get(plan.id) ?? []).sort((a, b) => a.stopOrder - b.stopOrder).map(stop => `${stop.stopTime} — ${stop.place}`).join("\n") : undefined,
      hotel_name: stay?.hotelName,
      room_number: stay?.roomNumber,
    } };
  });
  const recipientInputById = new Map(recipientInputs.map(item => [item.guestId, item]));
  const result = preflightMessages({
    purpose: body.purpose,
    channel: body.channel,
    templates: templateRows.map(template => ({ id: template.id, purpose: template.purpose, channel: template.channel, language: template.language, subject: template.subject ?? undefined, body: template.body, approved: template.status === "approved" })),
    recipients: recipientInputs,
  });
  const items: MessagePreflightItem[] = [
    ...result.items,
    ...[...notInvited.entries()].map(([guestId, guestName]) => ({ guestId, guestName, status: "skipped" as const, reason: "not-invited" as const })),
  ];
  const total = items.length, readyTotal = result.ready, skippedTotal = total - readyTotal;

  const batchId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.batch([
    db.insert(messageBatches).values({ id: batchId, groupId: body.groupId || null, event: (body.purpose === "travel" ? singlePlanEvent(planRows) : body.event) || null, agendaDate: body.agendaDate || null, purpose: body.purpose, channel: body.channel, status: "preflight", audienceJson: JSON.stringify({ guestIds }), totalCount: total, readyCount: readyTotal, skippedCount: skippedTotal, createdBy: user.personId, createdAt: now }),
    ...items.map(item => {
      const input = recipientInputById.get(item.guestId);
      return db.insert(messageRecipients).values({
        id: crypto.randomUUID(),
        batchId,
        guestId: item.guestId,
        templateId: item.templateId || null,
        status: item.status,
        reason: item.reason ? JSON.stringify({ code: item.reason, missing: item.missing ?? [] }) : null,
        payloadJson: JSON.stringify({ phone: input?.phone ?? null, email: input?.email ?? null, language: input?.language, variables: input?.variables ?? {} }),
        createdAt: now,
        updatedAt: now,
      });
    }),
  ]);
  return Response.json({ batchId, total, ready: readyTotal, skipped: skippedTotal, notSent: items.filter(item => item.status === "skipped").map(item => ({ guestId: item.guestId, guestName: item.guestName, reason: item.reason, missing: item.missing ?? [] })) }, { headers: { "Cache-Control": "no-store" } });
}

const isPurpose = (value: unknown): value is MessagePurpose => value === "invitation" || value === "agenda" || value === "travel" || value === "stay";
const isChannel = (value: unknown): value is MessageChannel => value === "whatsapp" || value === "email";
const formatDate = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const singlePlanEvent = (plans: { event: "malur" | "taj" }[]) => new Set(plans.map(plan => plan.event)).size === 1 ? plans[0]?.event : undefined;
function groupBy<T, K>(rows: T[], key: (row: T) => K) { const result = new Map<K, T[]>(); for (const row of rows) result.set(key(row), [...(result.get(key(row)) ?? []), row]); return result; }
