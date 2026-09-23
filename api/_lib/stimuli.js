import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));
const configPath = resolve(directory, "../../config/stimuli.json");
const safeFilename = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
let cachedStimuli;

export function getStimuli() {
  if (cachedStimuli) {
    return cachedStimuli;
  }

  const parsed = JSON.parse(readFileSync(configPath, "utf8"));
  if (!Array.isArray(parsed.stimuli) || parsed.stimuli.length === 0) {
    throw new Error("Stimulus configuration must contain at least one stimulus");
  }

  const ids = new Set();
  cachedStimuli = parsed.stimuli.map((item) => {
    if (
      !item ||
      typeof item.stimulus_id !== "string" ||
      !item.stimulus_id ||
      ids.has(item.stimulus_id)
    ) {
      throw new Error("Every stimulus_id must be unique and non-empty");
    }

    for (const field of ["desktop_image", "mobile_image"]) {
      if (typeof item[field] !== "string" || !safeFilename.test(item[field])) {
        throw new Error(`Invalid ${field} for stimulus ${item.stimulus_id}`);
      }
    }

    ids.add(item.stimulus_id);
    return {
      stimulus_id: item.stimulus_id,
      desktop_image: `stimuli/${item.desktop_image}`,
      mobile_image: `stimuli/${item.mobile_image}`,
    };
  });

  return cachedStimuli;
}
