const {
  HttpsError,
  onCall,
} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {
  addSiteAdminEmail: addSiteAdminEmailRecord,
  isSiteAdmin,
  listSiteAdminEmails: listSiteAdminEmailRecords,
  removeSiteAdminEmail: removeSiteAdminEmailRecord,
} = require("./features/site_admin/site_admin_module");
const {
  normalizeSiteAdminEmail,
} = require("./features/site_admin/domain/site_admin_email");

const CALLABLE_OPTIONS = Object.freeze({
  region: "us-central1",
});
const SERIAL_MUTATION_OPTIONS = Object.freeze({
  ...CALLABLE_OPTIONS,
  concurrency: 1,
  maxInstances: 1,
});

function getCaller(request, {requireVerified = true} = {}) {
  if (!request?.auth) {
    throw new HttpsError(
      "unauthenticated",
      "Sign in before managing site administrators.",
    );
  }

  let email;

  try {
    email = normalizeSiteAdminEmail(request.auth.token?.email);
  } catch (_error) {
    throw new HttpsError(
      "unauthenticated",
      "The signed-in account does not have a valid email address.",
    );
  }

  const emailVerified = request.auth.token?.email_verified === true;

  if (requireVerified && !emailVerified) {
    throw new HttpsError(
      "permission-denied",
      "Verify the signed-in email before managing site administrators.",
    );
  }

  return Object.freeze({email, emailVerified});
}

function getTargetEmail(request) {
  try {
    return normalizeSiteAdminEmail(request?.data?.email);
  } catch (error) {
    throw new HttpsError("invalid-argument", error.message);
  }
}

async function requireAdminCaller(request, checkSiteAdmin) {
  const caller = getCaller(request);

  if (!await checkSiteAdmin(caller.email)) {
    throw new HttpsError(
      "permission-denied",
      "The signed-in account is not a site administrator.",
    );
  }

  return caller;
}

function createSiteAdminHandlers({
  addAdmin = addSiteAdminEmailRecord,
  checkSiteAdmin = isSiteAdmin,
  listAdmins = listSiteAdminEmailRecords,
  removeAdmin = removeSiteAdminEmailRecord,
} = {}) {
  async function listHandler(request) {
    const emails = await listAdmins();

    if (emails.length === 0) {
      return Object.freeze({
        emails: [],
        bootstrapAvailable: true,
      });
    }

    await requireAdminCaller(request, checkSiteAdmin);

    return Object.freeze({
      emails,
      bootstrapAvailable: false,
    });
  }

  async function addHandler(request) {
    const caller = getCaller(request);
    const targetEmail = getTargetEmail(request);
    const existingEmails = await listAdmins();
    const bootstrap = existingEmails.length === 0;

    if (bootstrap) {
      if (targetEmail !== caller.email) {
        throw new HttpsError(
          "permission-denied",
          "The first site administrator must be the signed-in account.",
        );
      }
    } else if (!await checkSiteAdmin(caller.email)) {
      throw new HttpsError(
        "permission-denied",
        "The signed-in account is not a site administrator.",
      );
    }

    const email = await addAdmin(targetEmail);

    return Object.freeze({email, bootstrap});
  }

  async function removeHandler(request) {
    const caller = await requireAdminCaller(request, checkSiteAdmin);
    const targetEmail = getTargetEmail(request);

    if (targetEmail === caller.email) {
      throw new HttpsError(
        "failed-precondition",
        "A site administrator cannot remove their own email.",
      );
    }

    const existingEmails = await listAdmins();

    if (!existingEmails.includes(targetEmail)) {
      throw new HttpsError(
        "not-found",
        "The site-admin email could not be found.",
      );
    }

    if (existingEmails.length <= 1) {
      throw new HttpsError(
        "failed-precondition",
        "The final site administrator cannot be removed.",
      );
    }

    const email = await removeAdmin(targetEmail);

    return Object.freeze({email});
  }

  async function currentStatusHandler(request) {
    const existingEmails = await listAdmins();
    const bootstrapAvailable = existingEmails.length === 0;

    if (!request?.auth) {
      return Object.freeze({
        email: null,
        emailVerified: false,
        isAdmin: false,
        bootstrapAvailable,
      });
    }

    const caller = getCaller(request, {requireVerified: false});
    const isAdmin = caller.emailVerified
      ? await checkSiteAdmin(caller.email)
      : false;

    return Object.freeze({
      email: caller.email,
      emailVerified: caller.emailVerified,
      isAdmin,
      bootstrapAvailable,
    });
  }

  return Object.freeze({
    listHandler,
    addHandler,
    removeHandler,
    currentStatusHandler,
  });
}

function withErrorLogging(operation, handler) {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logger.error(`Site-admin ${operation} failed.`, {
        callerUid: request?.auth?.uid || null,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : null,
      });
      throw new HttpsError(
        "internal",
        `Site-admin ${operation} failed.`,
      );
    }
  };
}

const handlers = createSiteAdminHandlers();

const listSiteAdminEmails = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging("listing", handlers.listHandler),
);
const addSiteAdminEmail = onCall(
  SERIAL_MUTATION_OPTIONS,
  withErrorLogging("addition", handlers.addHandler),
);
const removeSiteAdminEmail = onCall(
  SERIAL_MUTATION_OPTIONS,
  withErrorLogging("removal", handlers.removeHandler),
);
const isCurrentUserSiteAdmin = onCall(
  CALLABLE_OPTIONS,
  withErrorLogging("status check", handlers.currentStatusHandler),
);

module.exports = {
  addSiteAdminEmail,
  createSiteAdminHandlers,
  isCurrentUserSiteAdmin,
  listSiteAdminEmails,
  removeSiteAdminEmail,
};
