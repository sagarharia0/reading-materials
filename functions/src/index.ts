import * as admin from "firebase-admin";
import {setGlobalOptions} from "firebase-functions/v2";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import {handleProcessUrl} from "./processUrl.js";
import {handleGenerateDigest} from "./generateDigest.js";
import {handleGenerateLearningProfile} from "./generateLearningProfile.js";
import {handleScheduledIngest} from "./scheduledIngest.js";

admin.initializeApp();

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");
const brevoKey = defineSecret("BREVO_API_KEY");
const deepgramKey = defineSecret("DEEPGRAM_API_KEY");

setGlobalOptions({maxInstances: 10});

export const processUrl = onRequest(
  {
    secrets: [anthropicKey, deepgramKey],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  handleProcessUrl
);

/** Scheduled daily digest — 6pm UK time. */
export const scheduledDigest = onSchedule(
  {
    schedule: "0 18 * * *",
    timeZone: "Europe/London",
    secrets: [anthropicKey, brevoKey],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async () => {
    await handleGenerateDigest();
  }
);

/** Manual trigger for testing digest generation. */
export const generateDigest = onRequest(
  {
    secrets: [anthropicKey, brevoKey],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (_req, res) => {
    try {
      await handleGenerateDigest();
      res.status(200).json({status: "ok"});
    } catch (err) {
      const msg = err instanceof Error ?
        err.message : String(err);
      res.status(500).json({error: msg});
    }
  }
);

/** Manual trigger for learning profile generation. */
export const updateLearningProfile = onRequest(
  {
    secrets: [anthropicKey],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (_req, res) => {
    try {
      await handleGenerateLearningProfile();
      res.status(200).json({status: "ok"});
    } catch (err) {
      const msg = err instanceof Error ?
        err.message : String(err);
      res.status(500).json({error: msg});
    }
  }
);

/** Scheduled RSS feed check — every 6 hours. */
export const scheduledIngest = onSchedule(
  {
    schedule: "0 */6 * * *",
    timeZone: "Europe/London",
    secrets: [anthropicKey, deepgramKey],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async () => {
    await handleScheduledIngest();
  }
);

/** Manual trigger for RSS feed check. */
export const checkFeeds = onRequest(
  {
    secrets: [anthropicKey, deepgramKey],
    timeoutSeconds: 540,
    memory: "512MiB",
  },
  async (_req, res) => {
    try {
      await handleScheduledIngest();
      res.status(200).json({status: "ok"});
    } catch (err) {
      const msg = err instanceof Error ?
        err.message : String(err);
      res.status(500).json({error: msg});
    }
  }
);
