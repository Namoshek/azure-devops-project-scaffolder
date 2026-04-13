/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";

// ── Mock react-markdown and remark plugins so Jest doesn't need to transpile
// their pure-ESM dependency graphs. We test our component logic (Mustache
// interpolation + MessageCard wrapper), not the Markdown library itself. ────────
jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div data-testid="markdown-content">{children}</div>,
}));
jest.mock("remark-gfm", () => ({ __esModule: true, default: () => {} }));
jest.mock("remark-breaks", () => ({ __esModule: true, default: () => {} }));

// Mock the ADO UI MessageCard — it uses AMD/require internals not available in jsdom
jest.mock("azure-devops-ui/Components/MessageCard/MessageCard", () => ({
  MessageCard: ({ children }: { children: React.ReactNode }) => <div data-testid="message-card">{children}</div>,
}));
jest.mock("azure-devops-ui/Components/MessageCard/MessageCard.Props", () => ({
  MessageCardSeverity: { Info: "info", Error: "error" },
}));

import { ScaffoldNote } from "../../src/components/ScaffoldNote";

describe("ScaffoldNote", () => {
  it("renders plain text inside a MessageCard", () => {
    render(<ScaffoldNote note="Hello world" values={{}} />);
    expect(screen.getByTestId("message-card")).toBeTruthy();
    expect(screen.getByTestId("markdown-content").textContent).toBe("Hello world");
  });

  it("interpolates a Mustache token before passing to the Markdown renderer", () => {
    render(<ScaffoldNote note="Hello **{{name}}**" values={{ name: "Alice" }} />);
    // After Mustache interpolation the string passed to ReactMarkdown should be "Hello **Alice**"
    expect(screen.getByTestId("markdown-content").textContent).toBe("Hello **Alice**");
  });

  it("preserves unfilled Mustache token as literal {{name}} when value is present but empty", () => {
    render(<ScaffoldNote note="Contact {{teamName}} for access" values={{ teamName: "" }} />);
    expect(screen.getByTestId("markdown-content").textContent).toBe("Contact {{teamName}} for access");
  });

  it("preserves unfilled Mustache token as literal {{name}} when value is empty string", () => {
    render(<ScaffoldNote note="Owner: {{owner}}" values={{ owner: "" }} />);
    expect(screen.getByTestId("markdown-content").textContent).toBe("Owner: {{owner}}");
  });

  it("interpolates a table cell Mustache token without corrupting markdown syntax", () => {
    render(
      <ScaffoldNote
        note="| Resource | Value |\n|---|---|\n| Project | {{projectName}} |"
        values={{ projectName: "my-service" }}
      />,
    );
    expect(screen.getByTestId("markdown-content").textContent).toContain("my-service");
    expect(screen.getByTestId("markdown-content").textContent).not.toContain("{{projectName}}");
  });

  it("passes a multi-line note through to the Markdown renderer as-is", () => {
    const multiLine = "Line one\nLine two\nLine three";
    render(<ScaffoldNote note={multiLine} values={{}} />);
    // remark-breaks (mocked to no-op) would normally turn \n into <br>;
    // here we just verify the string is forwarded correctly
    expect(screen.getByTestId("markdown-content").textContent).toBe(multiLine);
  });
});
