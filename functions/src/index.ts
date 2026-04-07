import * as admin from "firebase-admin";
import {setGlobalOptions} from "firebase-functions/v2";
import {onRequest} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import {defineSecret} from "firebase-functions/params";
import {handleProcessUrl} from "./processUrl.js";
import {handleGenerateDigest} from "./generateDigest.js";
import {handleGenerateLearningProfile} from "./generateLearningProfile.js";

admin.initializeApp();

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");
const brevoKey = defineSecret("BREVO_API_KEY");

setGlobalOptions({maxInstances: 10});

export const processUrl = onRequest(
  {
    secrets: [anthropicKey],
    timeoutSeconds: 120,
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
