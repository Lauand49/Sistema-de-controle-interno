import { z } from 'zod';

export const fieldTypeEnum = z.enum([
  'TEXT',
  'NUMBER',
  'CURRENCY',
  'DATE',
  'SELECT',
  'TEXTAREA',
]);

export const createCardSchema = z.object({
  title: z.string().min(1, 'O título do card é obrigatório.'),
  description: z.string().optional(),
  phaseId: z.string().min(1, 'A fase inicial é obrigatória.'),
  assigneeId: z.string().optional().nullable(),
  fieldValues: z.record(z.string(), z.any()).optional(),
});

export const updateCardSchema = z.object({
  title: z.string().min(1, 'O título é obrigatório.').optional(),
  description: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  fieldValues: z.record(z.string(), z.any()).optional(),
});

export const moveCardSchema = z.object({
  targetPhaseId: z.string().min(1, 'A fase destino é obrigatória.'),
  newOrder: z.number().int().optional(),
  fieldValues: z.record(z.string(), z.any()).optional(),
  userId: z.string().optional(),
});

export const createFieldSchema = z.object({
  name: z.string().min(1, 'O identificador do campo é obrigatório.'),
  label: z.string().min(1, 'O rótulo do campo é obrigatório.'),
  type: fieldTypeEnum,
  options: z.union([z.string(), z.array(z.string())]).optional(),
  required: z.boolean().default(false),
  phaseId: z.string().min(1, 'A fase é obrigatória.'),
  order: z.number().int().optional(),
});

/**
 * Validates if a card satisfies Phase Gate requirements for moving to targetPhase.
 * Returns missing required fields if any are empty or missing.
 */
export function validatePhaseGate(
  requiredFields: Array<{
    id: string;
    name: string;
    label: string;
    type: string;
    options?: string | null;
    required: boolean;
  }>,
  providedValues: Map<string, string | null | undefined> | Record<string, any>
) {
  const missingFields: Array<{
    id: string;
    name: string;
    label: string;
    type: string;
    options?: string | null;
  }> = [];

  const getFieldValue = (fieldId: string) => {
    if (providedValues instanceof Map) {
      return providedValues.get(fieldId);
    }
    return providedValues[fieldId];
  };

  for (const field of requiredFields) {
    if (!field.required) continue;

    const val = getFieldValue(field.id);
    const isMissing =
      val === undefined ||
      val === null ||
      (typeof val === 'string' && val.trim() === '');

    if (isMissing) {
      missingFields.push({
        id: field.id,
        name: field.name,
        label: field.label,
        type: field.type,
        options: field.options,
      });
    }
  }

  return {
    isValid: missingFields.length === 0,
    missingFields,
  };
}
