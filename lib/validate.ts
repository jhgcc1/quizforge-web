import { CreateQuizBodySchema, SaveAnswerBodySchema } from "@quizforge/core/schemas";

/**
 * Request bodies that have a contract are checked at the BFF too, with the same schemas the API uses: a malformed call is
 * rejected at the edge (400, same error shape) without reaching the API. The API stays the authority and validates again.
 */
export function validateBody(method: string, path: string[], body: string | undefined): { status: 400; body: { error: { code: string; message: string; details?: unknown } } } | undefined {
  const schema = method === "POST" && path.join("/") === "v1/quizzes" ? CreateQuizBodySchema : method === "PUT" && path[1] === "attempts" && path[3] === "answers" ? SaveAnswerBodySchema : undefined;
  if (!schema) return undefined;
  let json: unknown;
  try {
    json = body ? JSON.parse(body) : {};
  } catch {
    return { status: 400, body: { error: { code: "validation_error", message: "The request body is not valid JSON" } } };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return undefined;
  return { status: 400, body: { error: { code: "validation_error", message: "Invalid request body", details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } } };
}
