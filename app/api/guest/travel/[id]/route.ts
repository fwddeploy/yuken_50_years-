import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { guestCategories, travelPlanCategories, travelPlans, travelStops } from "../../../../../db/schema";
import { authenticateRequest } from "../../../../../src/server/session";
import { getRuntimeEnv } from "../../../../../src/server/runtime-env";

type TravelInput = { name?: string; event?: "malur" | "taj"; date?: string; mode?: string; routeName?: string; vehicleNumber?: string; driverName?: string; driverPhone?: string; categoryIds?: string[]; stops?: { id?: string; time?: string; place?: string }[] };

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await authenticateRequest(request);
  if (!user) return Response.json({ error: "Sign in again." }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json() as TravelInput;
  const name = body.name?.trim() ?? "", event = body.event, date = body.date?.trim() ?? "", mode = body.mode?.trim() ?? "", routeName = body.routeName?.trim() ?? "";
  const vehicleNumber = body.vehicleNumber?.trim() || null, driverName = body.driverName?.trim() || null, driverPhone = body.driverPhone?.trim() || null;
  const categoryIds = [...new Set((body.categoryIds ?? []).map(value => value.trim()).filter(Boolean))];
  const stops = (body.stops ?? []).map((stop, index) => ({ id: stop.id?.trim() || crypto.randomUUID(), order: index + 1, time: stop.time?.trim() ?? "", place: stop.place?.trim() ?? "" }));
  if (!name || (event !== "malur" && event !== "taj") || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || !mode || !routeName) return Response.json({ error: "Plan name, event, date, travel mode and route name are required." }, { status: 400 });
  if (!categoryIds.length) return Response.json({ error: "Choose at least one guest category." }, { status: 400 });
  if (!stops.length || stops.length > 20 || stops.some(stop => !/^([01]\d|2[0-3]):[0-5]\d$/u.test(stop.time) || !stop.place)) return Response.json({ error: "Add between 1 and 20 ordered stops with a time and place." }, { status: 400 });
  if (name.length > 180 || routeName.length > 180 || mode.length > 60 || (vehicleNumber?.length ?? 0) > 60 || (driverName?.length ?? 0) > 120 || (driverPhone?.length ?? 0) > 30 || stops.some(stop => stop.place.length > 200)) return Response.json({ error: "One or more travel fields are too long." }, { status: 400 });

  const db = getDb();
  const [[plan], categories, beforeCategories, beforeStops, submittedStops] = await Promise.all([
    db.select().from(travelPlans).where(and(eq(travelPlans.id, id), eq(travelPlans.active, true))).limit(1),
    db.select({ id: guestCategories.id }).from(guestCategories).where(and(inArray(guestCategories.id, categoryIds), eq(guestCategories.active, true))),
    db.select().from(travelPlanCategories).where(eq(travelPlanCategories.travelPlanId, id)),
    db.select().from(travelStops).where(and(eq(travelStops.travelPlanId, id), eq(travelStops.active, true))),
    db.select({ id: travelStops.id, travelPlanId: travelStops.travelPlanId }).from(travelStops).where(inArray(travelStops.id, stops.map(stop => stop.id))),
  ]);
  if (categories.length !== categoryIds.length) return Response.json({ error: "One or more selected categories are no longer available." }, { status: 409 });
  if (submittedStops.some(stop => stop.travelPlanId !== id)) return Response.json({ error: "One or more travel stops belong to another plan. Refresh and try again." }, { status: 409 });
  const sameDayPlans = await db.select({ planId: travelPlans.id, categoryId: travelPlanCategories.categoryId }).from(travelPlanCategories).innerJoin(travelPlans, eq(travelPlans.id, travelPlanCategories.travelPlanId)).where(and(eq(travelPlans.event, event), eq(travelPlans.travelDate, date), eq(travelPlans.active, true), inArray(travelPlanCategories.categoryId, categoryIds)));
  if (sameDayPlans.some(row => row.planId !== id)) return Response.json({ error: "A selected category already has another travel plan for this event and date." }, { status: 409 });

  const now = new Date().toISOString();
  const database = getRuntimeEnv().DB;
  const statements: D1PreparedStatement[] = [
    database.prepare(`INSERT INTO travel_plans (id, name, event, travel_date, mode, route_name, vehicle_number, driver_name, driver_phone, active, source_updated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'app', ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, event=excluded.event, travel_date=excluded.travel_date, mode=excluded.mode,
        route_name=excluded.route_name, vehicle_number=excluded.vehicle_number, driver_name=excluded.driver_name, driver_phone=excluded.driver_phone, updated_at=excluded.updated_at`).bind(id, name, event, date, mode, routeName, vehicleNumber, driverName, driverPhone, now, now),
    database.prepare("DELETE FROM travel_plan_categories WHERE travel_plan_id=?").bind(id),
    database.prepare("UPDATE travel_stops SET active=0, updated_at=? WHERE travel_plan_id=? AND active=1").bind(now, id),
  ];
  for (const categoryId of categoryIds) statements.push(database.prepare("INSERT INTO travel_plan_categories (travel_plan_id, category_id) VALUES (?, ?)").bind(id, categoryId));
  for (const stop of stops) statements.push(database.prepare(`
    INSERT INTO travel_stops (id, travel_plan_id, stop_order, stop_time, place, active, source_updated_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, 'app', ?, ?)
    ON CONFLICT(id) DO UPDATE SET travel_plan_id=excluded.travel_plan_id, stop_order=excluded.stop_order, stop_time=excluded.stop_time,
      place=excluded.place, active=1, updated_at=excluded.updated_at
      WHERE travel_stops.travel_plan_id=excluded.travel_plan_id
  `).bind(stop.id, id, stop.order, stop.time, stop.place, now, now));
  statements.push(database.prepare("INSERT INTO audit_events (id, actor_id, action, entity_type, entity_id, before_json, after_json, created_at) VALUES (?, ?, ?, 'travel_plan', ?, ?, ?, ?)").bind(crypto.randomUUID(), user.personId, plan ? "guest.travel-updated" : "guest.travel-created", id, JSON.stringify(plan ? { plan, categories: beforeCategories, stops: beforeStops } : null), JSON.stringify({ name, event, date, mode, routeName, vehicleNumber, driverName, driverPhone, categoryIds, stops }), now));
  try {
    await database.batch(statements);
  } catch (error) {
    if (error instanceof Error && error.message.toLocaleLowerCase("en-IN").includes("unique")) {
      return Response.json({ error: "A travel plan with this name already exists. Choose a different name." }, { status: 409 });
    }
    console.error("Travel plan save failed", error);
    return Response.json({ error: "Travel plan could not be saved. Try again." }, { status: 500 });
  }
  return Response.json({ id }, { headers: { "Cache-Control": "no-store" } });
}
