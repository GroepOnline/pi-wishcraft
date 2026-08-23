import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  parseVibeGenerateArgs,
  parseVibeLines,
} from "../src/working-vibes/index.ts";

async function importFauxProviderTools() {
  // The faux provider (fauxAssistantMessage, fauxProvider, etc.) is exported
  // via the package wildcard "./providers/*": "./dist/providers/*.js"
  return import("@earendil-works/pi-ai/providers/faux");
}

test("parseVibeGenerateArgs supports multi-word themes", () => {
  assert.deepEqual(parseVibeGenerateArgs(["pirate", "200"]), {
    theme: "pirate",
    count: 200,
  });
  assert.deepEqual(parseVibeGenerateArgs(["star", "trek", "200"]), {
    theme: "star trek",
    count: 200,
  });
  assert.deepEqual(parseVibeGenerateArgs(["star", "trek"]), {
    theme: "star trek",
    count: 100,
  });
  assert.deepEqual(parseVibeGenerateArgs(["star", "trek", "abc"]), {
    theme: "star trek abc",
    count: 100,
  });
  assert.deepEqual(parseVibeGenerateArgs(["lord", "of", "rings", "999"]), {
    theme: "lord of rings",
    count: 500,
  });
  assert.equal(parseVibeGenerateArgs([]), null);
});

test("generateVibesBatch includes a system prompt so faux providers can return text", async () => {
  const _links = { cleanup() {} };
  const home = mkdtempSync(join(tmpdir(), "powerline-vibes-home-"));
  const previousHome = process.env.HOME;
  process.env.HOME = home;

  try {
    const { fauxAssistantMessage, fauxProvider } =
      await importFauxProviderTools();
    const { generateVibesBatch, initVibeManager, setVibeModel } =
      await import("../src/working-vibes/index.ts");

    const registration = fauxProvider({
      provider: "test-provider",
      models: [{ id: "test-model" }],
    });

    const model = registration.getModel("test-model");
    assert.ok(model);

    registration.setResponses([
      (context) => {
        assert.match(context.systemPrompt ?? "", /loading messages/i);
        return fauxAssistantMessage(
          "Engaging warp drive...\nRunning diagnostics...",
        );
      },
    ]);

    initVibeManager({
      modelRegistry: {
        find(provider: string, modelId: string) {
          return provider === "test-provider" && modelId === "test-model"
            ? model
            : undefined;
        },
        async getApiKeyAndHeaders() {
          return { ok: true, apiKey: "test-key", headers: {} };
        },
        getProvider(provider: string) {
          return provider === "test-provider"
            ? registration.provider
            : undefined;
        },
        async getProviderAuth() {
          return undefined;
        },
      },
    });

    assert.equal(setVibeModel("test-provider/test-model"), true);

    const result = await generateVibesBatch("star trek", 2);

    assert.equal(result.success, true);
    assert.equal(result.count, 2);
    assert.equal(existsSync(result.filePath), true);
    assert.deepEqual(readFileSync(result.filePath, "utf8").trim().split("\n"), [
      "Engaging warp drive...",
      "Running diagnostics...",
    ]);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
    _links.cleanup();
  }
});

test("generateVibesBatch forwards resolved provider env and credential base URL", async () => {
  const _links = { cleanup() {} };
  const home = mkdtempSync(join(tmpdir(), "powerline-vibes-home-"));
  const previousHome = process.env.HOME;
  process.env.HOME = home;

  try {
    const { fauxAssistantMessage, fauxProvider } =
      await importFauxProviderTools();
    const { generateVibesBatch, initVibeManager, setVibeModel } =
      await import("../src/working-vibes/index.ts");

    const registration = fauxProvider({
      provider: "test-provider",
      models: [{ id: "test-model" }],
    });

    const model = registration.getModel("test-model");
    assert.ok(model);

    registration.setResponses([
      (_context, options, _state, requestModel) => {
        assert.deepEqual(options?.env, { AWS_PROFILE: "vibes" });
        assert.equal(requestModel.baseUrl, "https://credential.example/v1");
        return fauxAssistantMessage("Signing the request...");
      },
    ]);

    initVibeManager({
      modelRegistry: {
        find(provider: string, modelId: string) {
          return provider === "test-provider" && modelId === "test-model"
            ? model
            : undefined;
        },
        async getApiKeyAndHeaders() {
          return {
            ok: true,
            apiKey: "test-key",
            headers: {},
            env: { AWS_PROFILE: "vibes" },
          };
        },
        getProvider(provider: string) {
          return provider === "test-provider"
            ? registration.provider
            : undefined;
        },
        async getProviderAuth() {
          return {
            auth: {
              apiKey: "test-key",
              baseUrl: "https://credential.example/v1",
            },
          };
        },
      },
    });

    assert.equal(setVibeModel("test-provider/test-model"), true);

    const result = await generateVibesBatch("bedrock", 1);

    assert.equal(result.success, true);
    assert.deepEqual(readFileSync(result.filePath, "utf8").trim().split("\n"), [
      "Signing the request...",
    ]);
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
    _links.cleanup();
  }
});

test("on-demand vibe generation includes a system prompt for providers that require instructions", async () => {
  const _links = { cleanup() {} };
  const home = mkdtempSync(join(tmpdir(), "powerline-vibes-home-"));
  const previousHome = process.env.HOME;
  process.env.HOME = home;

  try {
    const { fauxAssistantMessage, fauxProvider } =
      await importFauxProviderTools();
    const {
      initVibeManager,
      onVibeAgentStart,
      onVibeBeforeAgentStart,
      setVibeModel,
      setVibeTheme,
    } = await import("../src/working-vibes/index.ts");

    const registration = fauxProvider({
      provider: "test-provider",
      models: [{ id: "test-model" }],
    });

    const model = registration.getModel("test-model");
    assert.ok(model);

    registration.setResponses([
      (context) => {
        assert.match(context.systemPrompt ?? "", /loading messages/i);
        return fauxAssistantMessage("Engaging warp drive...");
      },
    ]);

    initVibeManager({
      modelRegistry: {
        find(provider: string, modelId: string) {
          return provider === "test-provider" && modelId === "test-model"
            ? model
            : undefined;
        },
        async getApiKeyAndHeaders() {
          return { ok: true, apiKey: "test-key", headers: {} };
        },
        getProvider(provider: string) {
          return provider === "test-provider"
            ? registration.provider
            : undefined;
        },
        async getProviderAuth() {
          return undefined;
        },
      },
    });

    assert.equal(setVibeTheme("star trek"), true);
    assert.equal(setVibeModel("test-provider/test-model"), true);

    const updates: Array<string | undefined> = [];
    onVibeAgentStart();
    onVibeBeforeAgentStart("fix a bug", (message) => {
      updates.push(message);
    });

    const start = Date.now();
    while (
      !updates.includes("Engaging warp drive...") &&
      Date.now() - start < 1000
    ) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.equal(updates[0], "Channeling star trek...");
    assert.ok(updates.includes("Engaging warp drive..."));
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
    _links.cleanup();
  }
});

test("parseVibeLines cleans numbered/bulleted responses into ellipsized vibes", () => {
  assert.deepEqual(
    parseVibeLines(
      "1. \"Hoisting the sails\"\n- Swabbing the deck\nCharting course.\n...\n",
    ),
    ["Hoisting the sails...", "Swabbing the deck...", "Charting course..."],
  );
  assert.deepEqual(parseVibeLines(""), []);
});

test("generateVibeSamples previews a theme without writing a vibe file", async () => {
  const _links = { cleanup() {} };
  const home = mkdtempSync(join(tmpdir(), "powerline-vibes-home-"));
  const previousHome = process.env.HOME;
  process.env.HOME = home;

  try {
    const { fauxAssistantMessage, fauxProvider } =
      await importFauxProviderTools();
    const { generateVibeSamples, initVibeManager, setVibeModel } =
      await import("../src/working-vibes/index.ts");

    const registration = fauxProvider({
      provider: "test-provider",
      models: [{ id: "test-model" }],
    });

    const model = registration.getModel("test-model");
    assert.ok(model);

    registration.setResponses([
      fauxAssistantMessage(
        "Hoisting the sails...\nSwabbing the deck...\nCharting course...",
      ),
    ]);

    initVibeManager({
      modelRegistry: {
        find(provider: string, modelId: string) {
          return provider === "test-provider" && modelId === "test-model"
            ? model
            : undefined;
        },
        async getApiKeyAndHeaders() {
          return { ok: true, apiKey: "test-key", headers: {} };
        },
        getProvider(provider: string) {
          return provider === "test-provider"
            ? registration.provider
            : undefined;
        },
        async getProviderAuth() {
          return undefined;
        },
      },
    });

    assert.equal(setVibeModel("test-provider/test-model"), true);

    const result = await generateVibeSamples("pirate", 3);

    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.theme, "pirate");
      assert.deepEqual(result.samples, [
        "Hoisting the sails...",
        "Swabbing the deck...",
        "Charting course...",
      ]);
    }
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
    _links.cleanup();
  }
});

test("generateVibesBatch preserves provider errors instead of reporting an empty response", async () => {
  const _links = { cleanup() {} };
  const home = mkdtempSync(join(tmpdir(), "powerline-vibes-home-"));
  const previousHome = process.env.HOME;
  process.env.HOME = home;

  try {
    const { fauxAssistantMessage, fauxProvider } =
      await importFauxProviderTools();
    const { generateVibesBatch, initVibeManager, setVibeModel } =
      await import("../src/working-vibes/index.ts");

    const registration = fauxProvider({
      provider: "test-provider",
      models: [{ id: "test-model" }],
    });

    const model = registration.getModel("test-model");
    assert.ok(model);

    registration.setResponses([
      fauxAssistantMessage([], {
        stopReason: "error",
        errorMessage: "Instructions are required",
      }),
    ]);

    initVibeManager({
      modelRegistry: {
        find(provider: string, modelId: string) {
          return provider === "test-provider" && modelId === "test-model"
            ? model
            : undefined;
        },
        async getApiKeyAndHeaders() {
          return { ok: true, apiKey: "test-key", headers: {} };
        },
        getProvider(provider: string) {
          return provider === "test-provider"
            ? registration.provider
            : undefined;
        },
        async getProviderAuth() {
          return undefined;
        },
      },
    });

    assert.equal(setVibeModel("test-provider/test-model"), true);

    const result = await generateVibesBatch("noir", 2);

    assert.equal(result.success, false);
    assert.equal(result.error, "Instructions are required");
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    rmSync(home, { recursive: true, force: true });
    _links.cleanup();
  }
});
