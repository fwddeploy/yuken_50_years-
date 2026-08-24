-- An archived person must not keep reserving a sign-in number or initials.
-- Master Sheet imports reuse the same employee numbers for different people,
-- so a global unique index rejects the whole import while the old rows are
-- still being archived in the same batch.
DROP INDEX IF EXISTS uidx_people_employee_number;
DROP INDEX IF EXISTS uidx_people_initials;
CREATE UNIQUE INDEX uidx_people_employee_number_active ON people (employee_number) WHERE active = 1;
CREATE UNIQUE INDEX uidx_people_initials_active ON people (initials) WHERE active = 1;
-- The same reasoning applies to every business key the Master Sheet owns:
-- uniqueness must bind only rows that are still active, so a departing row
-- stops reserving a section number, a category name or a route name.
DROP INDEX IF EXISTS uidx_sections_number;
DROP INDEX IF EXISTS uidx_guest_categories_name;
DROP INDEX IF EXISTS uidx_guest_groups_name;
DROP INDEX IF EXISTS uidx_hotels_name;
DROP INDEX IF EXISTS uidx_travel_plans_name;
CREATE UNIQUE INDEX uidx_sections_number_active ON sections (section_number) WHERE active = 1;
CREATE UNIQUE INDEX uidx_guest_categories_name_active ON guest_categories (name) WHERE active = 1;
CREATE UNIQUE INDEX uidx_guest_groups_name_active ON guest_groups (name) WHERE active = 1;
CREATE UNIQUE INDEX uidx_hotels_name_active ON hotels (name) WHERE active = 1;
CREATE UNIQUE INDEX uidx_travel_plans_name_active ON travel_plans (name) WHERE active = 1;
