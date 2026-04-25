import test from "node:test";
import assert from "node:assert/strict";

import {
  GenerationMode,
  GenerationRequest,
  createDeterministicPalette,
  createPromptSeed
} from "../src/generation.mjs";

test("GenerationRequest trims prompt and keeps image mode metadata", () => {
  const request = new GenerationRequest({
    mode: GenerationMode.ImagePrompt,
    prompt: "  cinematic perfume bottle  ",
    imageName: "reference.png",
    ratio: "4:5",
    style: "editorial",
    fidelity: 78
  });

  assert.equal(request.prompt, "cinematic perfume bottle");
  assert.equal(request.mode, GenerationMode.ImagePrompt);
  assert.equal(request.imageName, "reference.png");
});

test("createPromptSeed returns a stable positive seed for the same prompt", () => {
  const firstSeed = createPromptSeed("quiet luxury product shot");
  const secondSeed = createPromptSeed("quiet luxury product shot");

  assert.equal(firstSeed, secondSeed);
  assert.ok(firstSeed > 0);
});

test("createDeterministicPalette creates three hsl colors from seed", () => {
  const palette = createDeterministicPalette(1327);

  assert.equal(palette.length, 3);
  assert.match(palette[0], /^hsl\(\d+ 68% 48%\)$/);
});
