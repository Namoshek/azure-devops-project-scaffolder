import { renderTemplate, evaluateWhenExpression } from "../../src/services/templateEngineService";

// ─── renderTemplate ────────────────────────────────────────────────────────────

describe("renderTemplate", () => {
  it("interpolates a simple variable", () => {
    expect(renderTemplate("Hello, {{name}}!", { name: "World" })).toBe("Hello, World!");
  });

  it("replaces a missing variable with an empty string", () => {
    expect(renderTemplate("{{missing}}", {})).toBe("");
  });

  it("handles multiple variables", () => {
    expect(renderTemplate("{{a}}-{{b}}", { a: "foo", b: "bar" })).toBe("foo-bar");
  });

  it("renders a path template with a variable segment", () => {
    expect(
      renderTemplate("src/{{projectName}}/index.ts", {
        projectName: "my-app",
      }),
    ).toBe("src/my-app/index.ts");
  });

  it("does not HTML-escape output (noEscape: true)", () => {
    expect(renderTemplate("{{value}}", { value: "<b>bold</b>" })).toBe("<b>bold</b>");
  });

  it("returns the template unchanged when there are no placeholders", () => {
    expect(renderTemplate("no placeholders here", {})).toBe("no placeholders here");
  });

  it("renders a nested object value via dot notation", () => {
    expect(renderTemplate("{{obj.key}}", { obj: { key: "nested" } })).toBe("nested");
  });

  it("supports truthy sections ({{#var}}) and inverted sections ({{^var}})", () => {
    const tpl = "{{#flag}}yes{{/flag}}{{^flag}}no{{/flag}}";
    expect(renderTemplate(tpl, { flag: true })).toBe("yes");
    expect(renderTemplate(tpl, { flag: false })).toBe("no");
  });
});

// ─── evaluateWhenExpression ────────────────────────────────────────────────────

describe("evaluateWhenExpression", () => {
  // ─── Simple identifier (truthy / falsy) ───────────────────────────────────

  it("returns true when identifier is truthy", () => {
    expect(evaluateWhenExpression("flag", { flag: true })).toBe(true);
    expect(evaluateWhenExpression("flag", { flag: "yes" })).toBe(true);
    expect(evaluateWhenExpression("flag", { flag: 1 })).toBe(true);
  });

  it("returns false when identifier is falsy", () => {
    expect(evaluateWhenExpression("flag", { flag: false })).toBe(false);
    expect(evaluateWhenExpression("flag", { flag: "" })).toBe(false);
    expect(evaluateWhenExpression("flag", { flag: undefined })).toBe(false);
    expect(evaluateWhenExpression("flag", {})).toBe(false);
  });

  // ─── Negation ─────────────────────────────────────────────────────────────

  it("negates a truthy identifier with !", () => {
    expect(evaluateWhenExpression("!flag", { flag: true })).toBe(false);
  });

  it("negates a falsy identifier with !", () => {
    expect(evaluateWhenExpression("!flag", { flag: false })).toBe(true);
  });

  it("negates a missing identifier with !", () => {
    expect(evaluateWhenExpression("!missing", {})).toBe(true);
  });

  // ─── Equality (==) ────────────────────────────────────────────────────────

  it("evaluates == with a matching string literal", () => {
    expect(evaluateWhenExpression('env == "prod"', { env: "prod" })).toBe(true);
  });

  it("evaluates == with a non-matching string literal", () => {
    expect(evaluateWhenExpression('env == "prod"', { env: "dev" })).toBe(false);
  });

  it("evaluates == true against a boolean true value", () => {
    expect(evaluateWhenExpression("enabled == true", { enabled: true })).toBe(true);
  });

  it("evaluates == true against a boolean false value", () => {
    expect(evaluateWhenExpression("enabled == true", { enabled: false })).toBe(false);
  });

  it("evaluates == false correctly", () => {
    expect(evaluateWhenExpression("flag == false", { flag: false })).toBe(true);
    expect(evaluateWhenExpression("flag == false", { flag: true })).toBe(false);
  });

  // ─── Inequality (!=) ──────────────────────────────────────────────────────

  it("evaluates != with a non-matching string literal", () => {
    expect(evaluateWhenExpression('env != "prod"', { env: "dev" })).toBe(true);
  });

  it("evaluates != with a matching string literal", () => {
    expect(evaluateWhenExpression('env != "prod"', { env: "prod" })).toBe(false);
  });

  it("evaluates != true correctly", () => {
    expect(evaluateWhenExpression("flag != true", { flag: false })).toBe(true);
    expect(evaluateWhenExpression("flag != true", { flag: true })).toBe(false);
  });

  // ─── AND (&&) ─────────────────────────────────────────────────────────────

  it("evaluates && — both true", () => {
    expect(evaluateWhenExpression("a && b", { a: true, b: true })).toBe(true);
  });

  it("evaluates && — one false", () => {
    expect(evaluateWhenExpression("a && b", { a: true, b: false })).toBe(false);
    expect(evaluateWhenExpression("a && b", { a: false, b: true })).toBe(false);
  });

  it("evaluates && — both false", () => {
    expect(evaluateWhenExpression("a && b", { a: false, b: false })).toBe(false);
  });

  // ─── OR (||) ──────────────────────────────────────────────────────────────

  it("evaluates || — both false", () => {
    expect(evaluateWhenExpression("a || b", { a: false, b: false })).toBe(false);
  });

  it("evaluates || — one true", () => {
    expect(evaluateWhenExpression("a || b", { a: false, b: true })).toBe(true);
    expect(evaluateWhenExpression("a || b", { a: true, b: false })).toBe(true);
  });

  // ─── Operator precedence (|| evaluated before &&) ─────────────────────────

  it("applies || before &&: 'a || b && c' is parsed as 'a || (b && c)'", () => {
    // a=false, b=true, c=true → false || (true && true) = true
    expect(evaluateWhenExpression("a || b && c", { a: false, b: true, c: true })).toBe(true);
    // a=false, b=true, c=false → false || (true && false) = false
    expect(evaluateWhenExpression("a || b && c", { a: false, b: true, c: false })).toBe(false);
  });

  // ─── Parentheses ──────────────────────────────────────────────────────────

  it("evaluates parenthetical grouping", () => {
    expect(evaluateWhenExpression("(a || b) && c", { a: false, b: true, c: true })).toBe(true);
    expect(evaluateWhenExpression("(a || b) && c", { a: false, b: true, c: false })).toBe(false);
  });

  it("handles nested parentheses", () => {
    expect(
      evaluateWhenExpression("((a || b) && (c || d))", {
        a: false,
        b: true,
        c: false,
        d: true,
      }),
    ).toBe(true);
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  it("handles single-quoted string literals in equality check", () => {
    expect(evaluateWhenExpression("env == 'prod'", { env: "prod" })).toBe(true);
  });

  it("treats an empty expression as falsy (empty string is falsy)", () => {
    // An empty expression evaluates to Boolean("") = false; the try-catch is
    // defensive for internal parse errors, not for empty/falsy values.
    expect(evaluateWhenExpression("", {})).toBe(false);
  });

  it("handles numeric literal comparison", () => {
    expect(evaluateWhenExpression("count == 0", { count: 0 })).toBe(true);
    expect(evaluateWhenExpression("count == 1", { count: 0 })).toBe(false);
  });
});
