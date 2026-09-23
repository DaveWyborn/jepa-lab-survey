"use strict";

const pages = {
  participant: document.querySelector("#participant-page"),
  stimulus: document.querySelector("#stimulus-page"),
  thanks: document.querySelector("#thanks-page"),
  completion: document.querySelector("#completion-page"),
};

const participantForm = document.querySelector("#participant-form");
const feedbackForm = document.querySelector("#feedback-form");
const descriptionGroup = document.querySelector("#impairment-description-group");
const descriptionInput = document.querySelector("#impairment-description");
const countdownStage = document.querySelector("#countdown-stage");
const countdownNumber = document.querySelector("#countdown-number");
const screenshotStage = document.querySelector("#screenshot-stage");
const stimulusImage = document.querySelector("#stimulus-image");
const responseStage = document.querySelector("#response-stage");
const responseQuestion = document.querySelector("#response-question");
const answerButtons = document.querySelector(".answer-buttons");
const startedAt = Date.now();
const intendedStimulusDurationMs = 1000;

let participantId = createParticipantId();
let stimuli = [];
let stimulusIndex = 0;
let currentPresentation = null;
let nextPreparedPromise = null;

function createParticipantId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
    const other = Math.floor(random * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

async function request(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data = {};
  try {
    data = await response.json();
  } catch (_error) {
    // The generic message below covers an invalid server response.
  }
  if (!response.ok) {
    throw new Error(data.error || "The response could not be saved. Please try again.");
  }
  return data;
}

function setStatus(elementId, message, isError = false) {
  const element = document.querySelector(`#${elementId}`);
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function showPage(name) {
  Object.entries(pages).forEach(([pageName, element]) => {
    element.hidden = pageName !== name;
  });
  const heading = pages[name].querySelector("h1");
  heading.focus();
  window.scrollTo(0, 0);
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function nextAnimationFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(resolve));
}

function selectStimulusVariant() {
  return window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop";
}

function preloadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "sync";
    image.onload = async () => {
      try {
        if (typeof image.decode === "function") {
          await image.decode();
        }
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      } catch (_error) {
        reject(new Error("The screenshot could not be prepared. Please try again later."));
      }
    };
    image.onerror = () => reject(new Error("The screenshot could not be loaded. Please try again later."));
    image.src = source;
  });
}

async function ensureDisplayImageReady(source) {
  stimulusImage.src = source;
  if (typeof stimulusImage.decode === "function") {
    await stimulusImage.decode();
    return;
  }
  if (stimulusImage.complete && stimulusImage.naturalWidth > 0) {
    return;
  }
  await new Promise((resolve, reject) => {
    stimulusImage.addEventListener("load", resolve, { once: true });
    stimulusImage.addEventListener(
      "error",
      () => reject(new Error("The screenshot could not be prepared. Please try again later.")),
      { once: true },
    );
  });
}

function showStimulusStage(activeStage) {
  [countdownStage, screenshotStage, responseStage].forEach((stage) => {
    stage.hidden = stage !== activeStage;
  });
}

function showPreparingState() {
  currentPresentation = null;
  responseQuestion.hidden = true;
  answerButtons.hidden = true;
  setStatus("response-status", "Preparing next image");
  showStimulusStage(responseStage);
}

async function prepareStimulus(index) {
  const stimulus = stimuli[index];
  const stimulusVariant = selectStimulusVariant();
  const imageSource = stimulus[`${stimulusVariant}_image`];
  const imageSize = await preloadImage(imageSource);
  return { stimulus, stimulusVariant, imageSource, imageSize };
}

function preloadNextStimulus() {
  if (stimulusIndex + 1 >= stimuli.length) {
    nextPreparedPromise = null;
    return;
  }
  nextPreparedPromise = prepareStimulus(stimulusIndex + 1).then(
    (prepared) => ({ prepared, error: null }),
    (error) => ({ prepared: null, error }),
  );
}

async function presentStimulus(prepared) {
  currentPresentation = null;
  await ensureDisplayImageReady(prepared.imageSource);
  const aspectRatio = prepared.imageSize.width / prepared.imageSize.height;
  document.documentElement.style.setProperty("--stimulus-aspect-ratio", String(aspectRatio));

  countdownNumber.textContent = "3";
  showStimulusStage(countdownStage);
  for (const number of [3, 2, 1]) {
    countdownNumber.textContent = String(number);
    await delay(1000);
  }

  showStimulusStage(screenshotStage);
  await nextAnimationFrame();
  const displayStarted = performance.now();
  await delay(Math.max(0, displayStarted + intendedStimulusDurationMs - performance.now()));
  screenshotStage.hidden = true;
  const displayEnded = performance.now();
  stimulusImage.removeAttribute("src");

  currentPresentation = {
    stimulusId: prepared.stimulus.stimulus_id,
    stimulusVariant: prepared.stimulusVariant,
    actualDisplayDurationMs: displayEnded - displayStarted,
  };

  preloadNextStimulus();
  responseQuestion.hidden = false;
  answerButtons.hidden = false;
  setStatus("response-status", "");
  showStimulusStage(responseStage);
  responseQuestion.focus();
}

document.querySelectorAll('input[name="visual_impairment"]').forEach((input) => {
  input.addEventListener("change", () => {
    const showDescription = input.checked && input.value === "Other visual impairment";
    descriptionGroup.hidden = !showDescription;
    descriptionInput.disabled = !showDescription;
    if (!showDescription) {
      descriptionInput.value = "";
    }
  });
});

participantForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!participantForm.reportValidity()) {
    return;
  }

  const button = participantForm.querySelector("button");
  const formData = new FormData(participantForm);
  button.disabled = true;
  setStatus("participant-status", "Saving...");

  try {
    await request("/api/session", {
      participant_id: participantId,
      age_band: formData.get("age_band"),
      visual_impairment: formData.get("visual_impairment"),
      visual_impairment_description: formData.get("visual_impairment_description") || "",
      stimulus_order: stimuli.map((stimulus) => stimulus.stimulus_id),
      viewport_width: document.documentElement.clientWidth,
      viewport_height: document.documentElement.clientHeight,
      device_pixel_ratio: window.devicePixelRatio || 1,
      user_agent: navigator.userAgent,
    });

    showPreparingState();
    showPage("stimulus");
    const prepared = await prepareStimulus(stimulusIndex);
    await presentStimulus(prepared);
  } catch (error) {
    if (pages.stimulus.hidden) {
      setStatus("participant-status", error.message, true);
      button.disabled = false;
    } else {
      setStatus("response-status", error.message, true);
    }
  }
});

responseStage.addEventListener("click", async (event) => {
  const selectedButton = event.target.closest("[data-response]");
  if (!selectedButton || !currentPresentation) {
    return;
  }

  document.querySelectorAll("[data-response]").forEach((button) => {
    button.disabled = true;
  });
  setStatus("response-status", "Saving...");

  try {
    await request("/api/response", {
      participant_id: participantId,
      stimulus_id: currentPresentation.stimulusId,
      stimulus_variant: currentPresentation.stimulusVariant,
      intended_stimulus_duration_ms: intendedStimulusDurationMs,
      actual_stimulus_display_duration_ms: currentPresentation.actualDisplayDurationMs,
      stimulus_display_duration_ms: currentPresentation.actualDisplayDurationMs,
      response: selectedButton.dataset.response,
    });

    currentPresentation = null;
    stimulusIndex += 1;
    if (stimulusIndex < stimuli.length) {
      showPreparingState();
      const result = nextPreparedPromise
        ? await nextPreparedPromise
        : { prepared: await prepareStimulus(stimulusIndex), error: null };
      nextPreparedPromise = null;
      if (result.error) {
        throw result.error;
      }
      let prepared = result.prepared;
      if (prepared.stimulusVariant !== selectStimulusVariant()) {
        prepared = await prepareStimulus(stimulusIndex);
      }
      window.scrollTo(0, 0);
      await presentStimulus(prepared);
    } else {
      showPage("thanks");
    }
  } catch (error) {
    if (currentPresentation) {
      setStatus("response-status", error.message, true);
      document.querySelectorAll("[data-response]").forEach((button) => {
        button.disabled = false;
      });
    } else {
      setStatus("response-status", error.message, true);
    }
  }
});

feedbackForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = feedbackForm.querySelector("button");
  button.disabled = true;
  setStatus("feedback-status", "Saving...");

  try {
    await request("/api/complete", {
      participant_id: participantId,
      pilot_feedback: document.querySelector("#pilot-feedback").value,
      total_completion_time_seconds: (Date.now() - startedAt) / 1000,
    });
    showPage("completion");
  } catch (error) {
    setStatus("feedback-status", error.message, true);
    button.disabled = false;
  }
});

async function initialise() {
  try {
    const response = await fetch("/api/stimuli", { cache: "no-store" });
    if (!response.ok) {
      throw new Error();
    }
    const data = await response.json();
    stimuli = shuffle(data.stimuli);
    participantForm.querySelector("button").disabled = false;
  } catch (_error) {
    participantForm.querySelector("button").disabled = true;
    setStatus("participant-status", "The survey could not be loaded. Please try again later.", true);
  }
}

descriptionInput.disabled = true;
initialise();
