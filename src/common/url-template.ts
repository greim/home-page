export const placeholder = "{query}";

export type FilledUrl =
  | { ok: true; url: string }
  | { ok: false; errorMessage: string };

/**
 * Inlines a form field's value into its URL template. Every `{query}` is
 * replaced with the URI-encoded, trimmed value.
 */
export const fillUrlTemplate = (template: string, value: string): FilledUrl => {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { ok: false, errorMessage: "Nothing to submit" };
  }
  if (!template.includes(placeholder)) {
    return {
      ok: false,
      errorMessage: `URL template is missing ${placeholder}`,
    };
  }
  const url = template.replaceAll(placeholder, encodeURIComponent(trimmed));
  if (!URL.canParse(url)) {
    return { ok: false, errorMessage: `Not a valid URL: ${url}` };
  }
  return { ok: true, url };
};
