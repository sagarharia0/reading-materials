import * as admin from "firebase-admin";
import {setGlobalOptions} from "firebase-functions/v2";
import {onRequest} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import {handleProcessUrl} from "./processUrl.js";

admin.initializeApp();

const anthropicKey = defineSecret("ANTHROPIC_API_KEY");

setGlobalOptions({maxInstances: 10});

export const processUrl = onRequest(
  {secrets: [anthropicKey], timeoutSeconds: 120, memory: "512MiB"},
  handleProcessUrl
);
