import { and, eq } from "drizzle-orm";
import { getDb } from "../../db";
import { guestCategories, guestGroups } from "../../db/schema";
import { parseGuestLanguage, type GuestEvent } from "../domain/guest-contract";

export type GuestWriteInput = {
  name?: string;
  company?: string;
  categoryId?: string;
  groupId?: string | null;
  country?: string;
  preferredLanguage?: string;
  phone?: string | null;
  email?: string | null;
  events?: GuestEvent[];
};

export async function validateGuestWrite(body: GuestWriteInput) {
  const name = body.name?.trim() ?? "";
  const company = body.company?.trim() ?? "";
  const categoryId = body.categoryId?.trim() ?? "";
  const groupId = body.groupId?.trim() || null;
  const country = body.country?.trim() || "India";
  const preferredLanguage = parseGuestLanguage(body.preferredLanguage ?? "");
  const phone = body.phone?.trim() || null;
  const email = body.email?.trim().toLocaleLowerCase("en-IN") || null;
  const events = [...new Set(body.events ?? [])].filter((event): event is GuestEvent => event === "malur" || event === "taj");
  if (!name || !categoryId || !preferredLanguage) throw new GuestWriteError("Guest name, category and preferred language are required.");
  if (!events.length) throw new GuestWriteError("Select Malur, Taj or both.");
  if (name.length > 180 || company.length > 180 || country.length > 100 || (phone?.length ?? 0) > 30 || (email?.length ?? 0) > 254) throw new GuestWriteError("One or more guest fields are too long.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new GuestWriteError("Enter a valid email address.");
  const db = getDb();
  const [category] = await db.select({ id: guestCategories.id }).from(guestCategories).where(and(eq(guestCategories.id, categoryId), eq(guestCategories.active, true))).limit(1);
  if (!category) throw new GuestWriteError("The selected guest category is no longer available.", 409);
  if (groupId) {
    const [group] = await db.select({ id: guestGroups.id }).from(guestGroups).where(and(eq(guestGroups.id, groupId), eq(guestGroups.active, true))).limit(1);
    if (!group) throw new GuestWriteError("The selected guest group is no longer available.", 409);
  }
  return { name, company, categoryId, groupId, country, preferredLanguage, phone, email, events };
}

export class GuestWriteError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
