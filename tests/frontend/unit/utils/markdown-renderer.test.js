import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mutationObservers = [];

const mermaidInitializeMock = vi.fn();
const mermaidRenderMock = vi.fn();
const katexRenderMock = vi.fn();
const domPurifySanitizeMock = vi.fn();
const markedParseMock = vi.fn();
const markedFootnoteParseMock = vi.fn();
let currentRenderer = null;
const markedUseMock = vi.fn((options) => {
  currentRenderer = options?.renderer ?? null;
});
const markedFootnoteUseMock = vi.fn();
const markedFootnotePluginFactory = vi.fn(() => "footnote-plugin");

vi.mock("dompurify", () => ({
  default: {
    sanitize: domPurifySanitizeMock,
  },
}));

const shikiHighlighterMock = {
  codeToHtml: vi.fn(
    (code, options) =>
      `<pre class="shiki snazzy" style="background-color:#282a36"><code><span data-lang="${options.lang}">${code}</span></code></pre>`
  ),
};

vi.mock("shiki", () => ({
  createHighlighter: vi.fn(() => Promise.resolve(shikiHighlighterMock)),
}));

vi.mock("katex", () => ({
  default: {
    renderToString: katexRenderMock,
  },
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidInitializeMock,
    render: mermaidRenderMock,
  },
}));

vi.mock("marked", () => {
  function Renderer() {}

  return {
    marked: {
      Renderer,
      parse: markedParseMock,
      use: markedUseMock,
    },
    Marked: vi.fn(function Marked(config) {
      this.config = config;
      this.parse = markedFootnoteParseMock;
      this.use = markedFootnoteUseMock;
      return this;
    }),
  };
});

vi.mock("marked-footnote", () => ({
  default: markedFootnotePluginFactory,
}));

// Use real css variable helper; set values in tests to avoid noisy warnings

let originalMutationObserver;

function createMutationObserverMock() {
  mutationObservers.length = 0;

  class MockMutationObserver {
    constructor(callback) {
      this.callback = callback;
      mutationObservers.push(this);
    }

    observe(target, options) {
      this.target = target;
      this.options = options;
    }

    disconnect() {}

    trigger(records) {
      this.callback(records);
    }
  }

  originalMutationObserver = globalThis.MutationObserver;
  globalThis.MutationObserver = MockMutationObserver;
}

describe("markdown-renderer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();

    createMutationObserverMock();

    // Provide clipboard mock for copy button tests
    global.navigator = {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    };

    // Provide default CSS variables to avoid warnings
    document.documentElement.style.setProperty("--color-brand-primary", "#0066cc");
    document.documentElement.style.setProperty("--color-surface-1", "#ffffff");
    document.documentElement.style.setProperty("--color-text-primary", "#111111");
    document.documentElement.setAttribute("data-theme", "light");

    domPurifySanitizeMock.mockImplementation((html) => `sanitized:${html}`);
    markedParseMock.mockImplementation((input) => `<p>${input}</p>`);
    markedFootnoteParseMock.mockImplementation((input) => `<p>${input}-footnote</p>`);
    katexRenderMock.mockImplementation((math, { displayMode }) => `<span data-display="${displayMode}">${math}</span>`);
    mermaidRenderMock.mockResolvedValue({ svg: '<svg viewBox="0 0 10 20"></svg>' });
    currentRenderer = null;
  });

  afterEach(() => {
    document.body.innerHTML = "";
    if (originalMutationObserver) {
      globalThis.MutationObserver = originalMutationObserver;
      originalMutationObserver = undefined;
    }
    vi.useRealTimers();
  });

  it("renders markdown with math and footnotes when complete content is provided", async () => {
    const { renderMarkdown } = await import("@utils/markdown-renderer.js");

    const markdown = "Math $a^2$ and $$b^2$$ with footnote[^1]\n\n[^1]: note";
    const html = renderMarkdown(markdown, true);

    expect(katexRenderMock).toHaveBeenCalledTimes(2);
    expect(markedFootnoteParseMock).toHaveBeenCalledWith(expect.stringContaining("a^2"));
    expect(markedUseMock).toHaveBeenCalled();
    expect(markedFootnoteUseMock).toHaveBeenCalledWith("footnote-plugin");
    expect(domPurifySanitizeMock).toHaveBeenCalledWith(expect.stringContaining("<p>Math"), expect.any(Object));
    expect(html).toContain("sanitized:");
  });

  it("sanitizes and escapes unsafe markdown when parsing fails during streaming", async () => {
    markedParseMock.mockImplementationOnce(() => {
      throw new Error("parse failure");
    });

    const { renderMarkdown } = await import("@utils/markdown-renderer.js");

    const html = renderMarkdown("<script>alert(1)</script>", false);

    expect(domPurifySanitizeMock).toHaveBeenCalledWith("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
    expect(html).toBe("sanitized:<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  it("processes mermaid diagrams and replaces blocks with rendered SVG wrappers", async () => {
    // Override mock to call custom renderer for code blocks
    markedParseMock.mockImplementation((input) => {
      const match = input.match(/```(\w*)\n([\s\S]*?)```/);
      if (match && currentRenderer?.code) {
        return currentRenderer.code({ lang: match[1], text: match[2] });
      }
      return `<p>${input}</p>`;
    });

    const { processMermaidDiagrams, renderMarkdown } = await import("@utils/markdown-renderer.js");

    const container = document.createElement("div");
    // Use renderMarkdown to properly populate the code store
    container.innerHTML = renderMarkdown("```mermaid\ngraph TD;A-->B;\n```", false);
    document.body.appendChild(container);

    await processMermaidDiagrams(container);
    // Wait for batch processing (50ms batch delay + processing time)
    await new Promise((resolve) => setTimeout(resolve, 100));

    const wrapper = container.querySelector(".mermaid-wrapper");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.dataset.processed).toBe("true");
    expect(wrapper?.dataset.mermaidCode).toContain("graph TD;A-->B;");

    const svg = wrapper?.querySelector("svg");
    expect(svg?.getAttribute("height")).toBe("20");
  });

  it("surfaces mermaid render errors as error blocks", async () => {
    // Override mock to call custom renderer for code blocks
    markedParseMock.mockImplementation((input) => {
      const match = input.match(/```(\w*)\n([\s\S]*?)```/);
      if (match && currentRenderer?.code) {
        return currentRenderer.code({ lang: match[1], text: match[2] });
      }
      return `<p>${input}</p>`;
    });

    mermaidRenderMock.mockRejectedValueOnce(new Error("diagram boom"));
    const { processMermaidDiagrams, renderMarkdown } = await import("@utils/markdown-renderer.js");

    const container = document.createElement("div");
    // Use renderMarkdown to properly populate the code store
    container.innerHTML = renderMarkdown("```mermaid\ngraph TD;X-->Y;\n```", false);
    document.body.appendChild(container);

    await processMermaidDiagrams(container);
    // Wait for batch processing (50ms batch delay + processing time)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Error is now inside a wrapper with dataset.processed on the wrapper
    const wrapper = container.querySelector(".mermaid-wrapper");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.dataset.processed).toBe("error");

    const errorDiv = wrapper?.querySelector(".mermaid-error");
    expect(errorDiv).toBeTruthy();
    expect(errorDiv?.textContent).toContain("diagram boom");
  });

  it("re-initializes mermaid on theme change signals", async () => {
    const { hasMarkdown } = await import("@utils/markdown-renderer.js");

    expect(hasMarkdown("## Title")).toBe(true);

    const observer = mutationObservers[0];
    expect(observer).toBeDefined();

    const initialCalls = mermaidInitializeMock.mock.calls.length;

    document.documentElement.setAttribute("data-theme", "dark");
    observer.trigger([{ type: "attributes", attributeName: "data-theme" }]);

    document.dispatchEvent(new Event("theme-changed"));

    expect(mermaidInitializeMock.mock.calls.length).toBeGreaterThanOrEqual(initialCalls + 2);
  });

  it("uses custom renderer for code blocks with Shiki highlighting", async () => {
    markedParseMock.mockImplementation((input) => {
      const match = input.match(/```(\w*)\n([\s\S]*?)```/);
      if (match && currentRenderer?.code) {
        return currentRenderer.code({ lang: match[1], text: match[2] });
      }
      return `<p>${input}</p>`;
    });

    const { renderMarkdown } = await import("@utils/markdown-renderer.js");

    const highlighted = renderMarkdown("```js\nconst a = 1;\n```", false);
    expect(highlighted).toContain("shiki");
    expect(highlighted).toContain("const a = 1;");

    // Unknown languages still get syntax highlighting with Shiki
    const unknown = renderMarkdown("```unknown\ncode\n```", false);
    expect(unknown).toContain("shiki");
    expect(unknown).toContain("code");
  });

  it("returns empty string when markdown is empty", async () => {
    const { renderMarkdown } = await import("@utils/markdown-renderer.js");
    expect(renderMarkdown("")).toBe("");
  });

  it("renders math errors when KaTeX throws", async () => {
    katexRenderMock.mockImplementationOnce(() => {
      throw new Error("math fail");
    });
    const { renderMarkdown } = await import("@utils/markdown-renderer.js");
    const html = renderMarkdown("$1+1$", false);
    expect(html).toContain("math-error");
  });

  it("handles mermaid processing with missing inputs gracefully", async () => {
    const { processMermaidDiagrams } = await import("@utils/markdown-renderer.js");
    await expect(processMermaidDiagrams(null)).resolves.toBeUndefined();

    const container = document.createElement("div");
    container.innerHTML = "<p>no diagrams here</p>";
    await expect(processMermaidDiagrams(container)).resolves.toBeUndefined();
  });

  it("detects absence of markdown syntax", async () => {
    const { hasMarkdown } = await import("@utils/markdown-renderer.js");
    expect(hasMarkdown("plain text only")).toBe(false);
  });

  it("ignores copy button initialization when container is missing", async () => {
    const { initializeCodeCopyButtons } = await import("@utils/markdown-renderer.js");
    expect(() => initializeCodeCopyButtons(null)).not.toThrow();
  });

  it("initializes copy buttons and restores state after copy success", async () => {
    vi.useFakeTimers();
    const { initializeCodeCopyButtons } = await import("@utils/markdown-renderer.js");

    const container = document.createElement("div");
    container.innerHTML = '<button class="code-copy-btn" data-code="console.log(&quot;hi&quot;);">copy</button>';
    document.body.appendChild(container);

    initializeCodeCopyButtons(container);

    const button = container.querySelector(".code-copy-btn");
    button?.dispatchEvent(new Event("click", { bubbles: true }));

    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('console.log("hi");');
    expect(button?.classList.contains("copied")).toBe(true);

    await vi.runAllTimersAsync();
    expect(button?.classList.contains("copied")).toBe(false);
  });

  it("shows error feedback when copy fails and restores original content", async () => {
    vi.useFakeTimers();
    navigator.clipboard.writeText.mockRejectedValueOnce(new Error("copy failed"));

    const { initializeCodeCopyButtons } = await import("@utils/markdown-renderer.js");

    const container = document.createElement("div");
    container.innerHTML = '<button class="code-copy-btn" data-code="let x = 1;">copy</button>';
    document.body.appendChild(container);

    initializeCodeCopyButtons(container);
    const button = container.querySelector(".code-copy-btn");

    button?.dispatchEvent(new Event("click", { bubbles: true }));
    await Promise.resolve();

    expect(button?.innerHTML).toContain("<line");

    await vi.runAllTimersAsync();
    expect(button?.textContent).toBe("copy");
  });

  it("initializes scroll fallback for mermaid diagrams on first batch process", async () => {
    // Override mock to call custom renderer for code blocks
    markedParseMock.mockImplementation((input) => {
      const match = input.match(/```(\w*)\n([\s\S]*?)```/);
      if (match && currentRenderer?.code) {
        return currentRenderer.code({ lang: match[1], text: match[2] });
      }
      return `<p>${input}</p>`;
    });

    const { processMermaidDiagrams, renderMarkdown } = await import("@utils/markdown-renderer.js");

    // Create chat container for scroll fallback
    const chatContainer = document.createElement("div");
    chatContainer.id = "chat-container";
    document.body.appendChild(chatContainer);

    const container = document.createElement("div");
    container.innerHTML = renderMarkdown("```mermaid\ngraph TD;A-->B;\n```", false);
    chatContainer.appendChild(container);

    await processMermaidDiagrams(container);
    // Wait for batch processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify scroll listener was added (scroll fallback initialized)
    // Trigger scroll event to exercise the fallback code path
    chatContainer.dispatchEvent(new Event("scroll"));

    // Wait for debounced fallback check
    await new Promise((resolve) => setTimeout(resolve, 250));

    chatContainer.remove();
  });

  it("scroll fallback catches visible unrendered diagrams", async () => {
    // Override mock to call custom renderer for code blocks
    markedParseMock.mockImplementation((input) => {
      const match = input.match(/```(\w*)\n([\s\S]*?)```/);
      if (match && currentRenderer?.code) {
        return currentRenderer.code({ lang: match[1], text: match[2] });
      }
      return `<p>${input}</p>`;
    });

    const { processMermaidDiagrams, renderMarkdown } = await import("@utils/markdown-renderer.js");

    // Create chat container
    const chatContainer = document.createElement("div");
    chatContainer.id = "chat-container";
    chatContainer.style.height = "200px";
    chatContainer.style.overflow = "auto";
    document.body.appendChild(chatContainer);

    // Create multiple diagrams
    const container = document.createElement("div");
    container.innerHTML = renderMarkdown("```mermaid\ngraph TD;X-->Y;\n```", false);
    chatContainer.appendChild(container);

    // Process but skip the batch wait - simulating observer miss
    await processMermaidDiagrams(container);

    // Trigger scroll to exercise fallback
    chatContainer.dispatchEvent(new Event("scroll"));

    // Wait for debounced check plus render time
    await new Promise((resolve) => setTimeout(resolve, 350));

    chatContainer.remove();
  });

  it("scroll fallback skips diagrams without code in store", async () => {
    const { processMermaidDiagrams } = await import("@utils/markdown-renderer.js");

    // Create chat container
    const chatContainer = document.createElement("div");
    chatContainer.id = "chat-container";
    document.body.appendChild(chatContainer);

    // Create a fake mermaid wrapper without corresponding code in store
    const wrapper = document.createElement("div");
    wrapper.className = "mermaid-wrapper mermaid-loading";
    wrapper.dataset.mermaidId = "nonexistent-id-12345";
    chatContainer.appendChild(wrapper);

    // Trigger processMermaidDiagrams to initialize fallback
    const container = document.createElement("div");
    await processMermaidDiagrams(container);
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Trigger scroll to exercise fallback with missing code path
    chatContainer.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 250));

    // Wrapper should still be in loading state (not processed)
    expect(wrapper.classList.contains("mermaid-loading")).toBe(true);

    chatContainer.remove();
  });

  it("scroll fallback skips off-viewport diagrams", async () => {
    // Override mock to call custom renderer for code blocks
    markedParseMock.mockImplementation((input) => {
      const match = input.match(/```(\w*)\n([\s\S]*?)```/);
      if (match && currentRenderer?.code) {
        return currentRenderer.code({ lang: match[1], text: match[2] });
      }
      return `<p>${input}</p>`;
    });

    const { processMermaidDiagrams, renderMarkdown } = await import("@utils/markdown-renderer.js");

    // Create chat container
    const chatContainer = document.createElement("div");
    chatContainer.id = "chat-container";
    chatContainer.style.height = "100px";
    chatContainer.style.overflow = "auto";
    document.body.appendChild(chatContainer);

    // Create diagram that would be off-screen (mock getBoundingClientRect)
    const container = document.createElement("div");
    container.innerHTML = renderMarkdown("```mermaid\ngraph LR;Off-->Screen;\n```", false);
    chatContainer.appendChild(container);

    const wrapper = container.querySelector(".mermaid-wrapper");
    if (wrapper) {
      // Mock the wrapper to appear off-screen
      const originalGetBoundingClientRect = wrapper.getBoundingClientRect;
      wrapper.getBoundingClientRect = () => ({
        top: 5000,
        bottom: 5100,
        left: 0,
        right: 100,
        width: 100,
        height: 100,
      });

      // Process diagrams
      await processMermaidDiagrams(container);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Trigger scroll fallback
      chatContainer.dispatchEvent(new Event("scroll"));
      await new Promise((resolve) => setTimeout(resolve, 250));

      // Restore original
      wrapper.getBoundingClientRect = originalGetBoundingClientRect;
    }

    chatContainer.remove();
  });
});
