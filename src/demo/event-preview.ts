export type EventUser = {
  id: string;
  initials: string;
  fullName: string;
  employeeNumber: string;
  responsibility: string;
  isCore: boolean;
};

export type EventUpdate = { id: string; author: string; message: string; at: string };
export type EventJob = {
  id: string;
  sectionId: string;
  title: string;
  venue: "malur" | "taj" | "general" | "red-raino";
  finishBy?: string;
  ownerIds: string[];
  ownerLabel: string;
  organised: boolean;
  complete: boolean;
  blockingNote?: string;
  updatedAt?: string;
  updates: EventUpdate[];
};
export type EventSection = { id: string; number: number; heading: string };

export const previewUser: EventUser = {
  id: "preview-core",
  initials: "PC",
  fullName: "Preview coordinator",
  employeeNumber: "preview",
  responsibility: "Core committee",
  isCore: true,
};

export const previewSections: EventSection[] = [
  { id: "programme", number: 1, heading: "Programme and ceremony" },
  { id: "movement", number: 2, heading: "People movement and facilities" },
  { id: "venue", number: 3, heading: "Venue readiness" },
  { id: "communications", number: 4, heading: "Communications and coordination" },
];

export const previewJobs: EventJob[] = [
  { id: "demo-1", sectionId: "programme", title: "Confirm opening sequence", venue: "malur", finishBy: "2026-11-10", ownerIds: ["preview-core"], ownerLabel: "Programme team", organised: true, complete: false, updates: [{ id: "u-1", author: "Programme team", message: "Sequence reviewed; final speaker timing is pending.", at: "Today · 09:30" }] },
  { id: "demo-2", sectionId: "programme", title: "Confirm evening stage run", venue: "taj", finishBy: "2026-11-12", ownerIds: ["venue-team"], ownerLabel: "Stage team", organised: false, complete: false, blockingNote: "Awaiting venue confirmation", updates: [] },
  { id: "demo-3", sectionId: "movement", title: "Publish plant arrival plan", venue: "malur", finishBy: "2026-11-08", ownerIds: ["preview-core"], ownerLabel: "Movement team", organised: true, complete: true, updates: [{ id: "u-2", author: "Movement team", message: "Arrival gates and desk positions confirmed.", at: "Yesterday · 17:10" }] },
  { id: "demo-4", sectionId: "movement", title: "Confirm hotel-to-venue movement", venue: "taj", finishBy: "2026-11-13", ownerIds: ["transport-team"], ownerLabel: "Transport team", organised: false, complete: false, updates: [] },
  { id: "demo-5", sectionId: "venue", title: "Complete registration desk setup", venue: "malur", ownerIds: ["venue-team"], ownerLabel: "Venue team", organised: true, complete: false, updates: [] },
  { id: "demo-6", sectionId: "venue", title: "Verify ballroom seating layout", venue: "taj", finishBy: "2026-11-14", ownerIds: ["preview-core"], ownerLabel: "Venue team", organised: false, complete: false, updates: [{ id: "u-3", author: "Venue team", message: "Revised layout requested from the venue.", at: "18 Aug · 14:05" }] },
  { id: "demo-7", sectionId: "communications", title: "Review coordinator day sheet", venue: "general", finishBy: "2026-11-14", ownerIds: ["preview-core"], ownerLabel: "Communications team", organised: false, complete: false, updates: [] },
  { id: "demo-8", sectionId: "communications", title: "Prepare venue change template", venue: "general", ownerIds: ["communications-team"], ownerLabel: "Communications team", organised: true, complete: true, updates: [] },
];

export const previewProgramme = {
  malur: [["08:00", "Gates and registration open"], ["09:30", "Opening ceremony"], ["11:00", "Plant programme"], ["13:30", "Lunch"], ["17:30", "Return coaches"]],
  taj: [["17:30", "Arrival and high tea"], ["18:30", "Welcome and inauguration"], ["19:30", "Golden Jubilee programme"], ["20:30", "Cultural programme"], ["21:15", "Dinner"]],
} as const;

export const previewBudget = [
  { id: "b-1", category: "Venue", description: "Venue and hospitality placeholder", amountPaise: 0, status: "planned" },
  { id: "b-2", category: "Programme", description: "Programme production placeholder", amountPaise: 0, status: "planned" },
  { id: "b-3", category: "Transport", description: "Movement placeholder", amountPaise: 0, status: "planned" },
] as const;
