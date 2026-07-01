import type { FastifyReply } from 'fastify';
import type { z } from 'zod';

/**
 * Body gegen ein zod-Schema prüfen. Bei Fehler wird 400 gesendet und null
 * zurückgegeben (Aufrufer bricht dann ab); sonst die geparsten, typisierten Daten.
 */
export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
  reply: FastifyReply
): z.infer<T> | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    void reply.code(400).send({ error: first?.message ?? 'Ungültige Eingabe', issues: result.error.issues });
    return null;
  }
  return result.data;
}
