import { z } from "zod";
import {
  BLOOD_GROUPS,
  CASE_SEVERITIES,
  CASE_STATUSES,
  COUNTABLE_RESOURCES,
  INCIDENT_TYPES,
  RESOURCE_TYPES,
  SPECIALIST_TYPES,
  USER_ROLES,
} from "@/lib/types";

// Nagpur district bounding box (generous) so the demo location picker cannot wander off-map.
const lat = z.number().min(20.5).max(21.8);
const lng = z.number().min(78.4).max(79.8);

export const CreateCaseSchema = z.object({
  tempPatientId: z.string().trim().min(2).max(40).optional(),
  age: z.number().int().min(0).max(120).optional(),
  sex: z.enum(["M", "F", "OTHER"]).optional(),
  incidentType: z.enum(INCIDENT_TYPES),
  notes: z.string().trim().min(3).max(2000),
  severity: z.enum(CASE_SEVERITIES),
  bloodGroup: z.enum(BLOOD_GROUPS).optional(),
  bloodUnitsNeeded: z.number().int().min(0).max(20).optional(),
  lat,
  lng,
  locationLabel: z.string().trim().min(2).max(120),
  ambulanceId: z.string().optional(),
  /** Optional: caller may pass pre-reviewed requirements (skips extraction). */
  requirements: z.array(z.enum(RESOURCE_TYPES)).optional(),
});
export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;

export const UpdateCaseSchema = z
  .object({
    requirements: z.array(z.enum(RESOURCE_TYPES)).max(RESOURCE_TYPES.length).optional(),
    bloodGroup: z.enum(BLOOD_GROUPS).nullable().optional(),
    bloodUnitsNeeded: z.number().int().min(0).max(20).optional(),
    severity: z.enum(CASE_SEVERITIES).optional(),
    status: z.enum(CASE_STATUSES).optional(),
    actorRole: z.enum(USER_ROLES).default("PARAMEDIC"),
  })
  .refine((v) => Object.keys(v).some((k) => k !== "actorRole"), { message: "Nothing to update" });
export type UpdateCaseInput = z.infer<typeof UpdateCaseSchema>;

const availabilityPatch = z.object({
  available: z.number().int().min(0).max(500).optional(),
  total: z.number().int().min(0).max(500).optional(),
});

export const UpdateHospitalSchema = z
  .object({
    resources: z.partialRecord(z.enum(COUNTABLE_RESOURCES), availabilityPatch).optional(),
    specialists: z
      .partialRecord(
        z.enum(SPECIALIST_TYPES),
        z.object({ onCall: z.boolean(), note: z.string().max(120).optional() }),
      )
      .optional(),
    updatedBy: z.string().trim().min(1).max(60).default("Hospital coordinator"),
  })
  .refine((v) => v.resources || v.specialists, { message: "Provide resources or specialists" });
export type UpdateHospitalInput = z.infer<typeof UpdateHospitalSchema>;

export const UpdateBloodBankSchema = z.object({
  inventory: z.partialRecord(z.enum(BLOOD_GROUPS), z.object({ available: z.number().int().min(0).max(999) })),
  updatedBy: z.string().trim().min(1).max(60).default("Blood bank operator"),
});
export type UpdateBloodBankInput = z.infer<typeof UpdateBloodBankSchema>;

export const CreateRequestSchema = z.object({
  caseId: z.string().min(1),
  hospitalId: z.string().min(1),
  /** Client-generated idempotency key so a double tap never creates two requests. */
  idempotencyKey: z.string().min(4).max(80).optional(),
});
export type CreateRequestInput = z.infer<typeof CreateRequestSchema>;

export const RespondRequestSchema = z.object({
  action: z.enum(["ACCEPT", "REJECT"]),
  reason: z.string().trim().max(200).optional(),
  respondedBy: z.string().trim().min(1).max(60).default("Hospital coordinator"),
});
export type RespondRequestInput = z.infer<typeof RespondRequestSchema>;
